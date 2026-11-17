import { describe, expect, it, beforeEach } from "vitest";
import { applyInventoryChange, undoInventoryChange } from "@/server/inventory";
import { prisma } from "@/server/db";
import { compareQuantities } from "@/lib/units";
import { getExpiryState } from "@/server/expiry";

const id = "test-stock-item";
describe("inventory transaction", () => {
 beforeEach(async () => { await prisma.inventoryLog.deleteMany(); await prisma.ingredient.deleteMany(); await prisma.ingredient.create({data:{id,name:"测试食材",category:"蔬菜",unit:"g",stock_qty:500,safety_stock:0,cost_per_unit:0.02}}); });
 it("扣减库存并写入负数流水", async () => { const result=await applyInventoryChange(id,-120,"consume"); expect(result.ingredient.stock_qty).toBe(380); expect(result.log.delta).toBe(-120); });
 it("撤销流水后恢复库存并写入反向流水", async () => { const changed=await applyInventoryChange(id,-120,"consume"); const undone=await undoInventoryChange(changed.log.id); expect(undone.ingredient.stock_qty).toBe(500); expect(undone.log.delta).toBe(120); });
 it("禁止扣减超过现有库存", async () => { await expect(applyInventoryChange(id,-501,"consume")).rejects.toThrow("库存不足"); });
 it("拒绝重复撤销", async () => { const changed=await applyInventoryChange(id,-10,"consume"); await undoInventoryChange(changed.log.id); await expect(undoInventoryChange(changed.log.id)).rejects.toThrow("已撤销"); });
});
describe("unit conversion", () => {
 it("正确转换公斤和斤", () => { expect(compareQuantities(1,"kg",2,"斤")).toBe(0); });
 it("正确转换升和毫升", () => { expect(compareQuantities(1,"L",750,"ml")).toBe(250); });
 it("拒绝跨量纲比较", () => { expect(() => compareQuantities(1,"kg",1,"L")).toThrow("不同量纲"); });
});
describe("expiry status", () => {
 const base=new Date("2026-11-15T12:00:00");
 it("当天即判断过期", () => { expect(getExpiryState(new Date("2026-11-15T23:00:00"),base)).toBe("expired"); });
 it("三天内判断临期", () => { expect(getExpiryState(new Date("2026-11-18T08:00:00"),base)).toBe("expiring"); });
 it("四天后仍新鲜", () => { expect(getExpiryState(new Date("2026-11-19T00:00:00"),base)).toBe("fresh"); });
});
