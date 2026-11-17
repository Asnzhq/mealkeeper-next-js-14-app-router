import { zhCN } from "@/lib/i18n/zh-CN";
export interface IngredientTemplate {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  storage: string;
  safety_stock: number;
  expiryDays: number;
  icon: string;
}

export const ingredientTemplates: IngredientTemplate[] = [
  {name:"鸡蛋",category:"蛋奶",unit:"个",quantity:6,storage:"fridge",safety_stock:3,expiryDays:15,icon:"🥚"},
  {name:"牛奶",category:"蛋奶",unit:"L",quantity:1,storage:"fridge",safety_stock:0.5,expiryDays:7,icon:"🥛"},
  {name:"番茄",category:"蔬菜",unit:"个",quantity:4,storage:"fridge",safety_stock:2,expiryDays:7,icon:"🍅"},
  {name:"五花肉",category:"肉类",unit:"斤",quantity:1,storage:"freezer",safety_stock:0.5,expiryDays:15,icon:"🥩"},
  {name:"青菜",category:"蔬菜",unit:"斤",quantity:1,storage:"fridge",safety_stock:0.5,expiryDays:3,icon:"🥬"},
  {name:"苹果",category:"水果",unit:"个",quantity:4,storage:"fridge",safety_stock:2,expiryDays:7,icon:"🍎"},
  {name:"三文鱼",category:"海鲜",unit:"g",quantity:300,storage:"freezer",safety_stock:150,expiryDays:3,icon:"🐟"},
  {name:"大米",category:"主食",unit:"kg",quantity:2,storage:"pantry",safety_stock:1,expiryDays:365,icon:"🍚"},
  {name:"干香菇",category:"干货",unit:"g",quantity:100,storage:"pantry",safety_stock:50,expiryDays:365,icon:"🍄"},
  {name:"生抽",category:"调料",unit:"ml",quantity:1,storage:"pantry",safety_stock:1,expiryDays:180,icon:"🫙"},
];

export const ingredientCategories = [zhCN.allCategories,zhCN.vegetables,zhCN.fruits,zhCN.meats,zhCN.seafood,zhCN.dairy,zhCN.staples,zhCN.pantry,zhCN.seasonings,zhCN.otherCategory] as const;
export const ingredientUnits = ["g","kg","斤","两","ml","L","个","只","勺","条","盒","把","根","棵","颗","块","袋","罐","头","份","捆"] as const;

export interface ParsedIngredientLine { name: string; quantity: number; unit: string }
export interface IngredientLineError { line: number; text: string; message: string }
export interface IngredientParseResult { items: ParsedIngredientLine[]; errors: IngredientLineError[] }
export function parseIngredientLines(input: string): IngredientParseResult {
  const items: ParsedIngredientLine[] = [];
  const errors: IngredientLineError[] = [];
  for (const [index, raw] of input.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s+([+-]?(?:\d+\.?\d*|\.\d+))\s*(\S+)$/u);
    if (!match) { errors.push({ line: index + 1, text: line, message: zhCN.batchLineFormatError }); continue; }
    const name = match[1].trim();
    const quantity = Number(match[2]);
    const unit = match[3].trim();
    if (!name || name.length > 30) { errors.push({ line: index + 1, text: line, message: zhCN.ingredientNameLengthError }); continue; }
    if (!Number.isFinite(quantity) || quantity <= 0) { errors.push({ line: index + 1, text: line, message: zhCN.batchQuantityError }); continue; }
    if (!unit || unit.length > 20) { errors.push({ line: index + 1, text: line, message: zhCN.customUnitLengthError }); continue; }
    items.push({ name, quantity, unit });
  }
  return { items, errors };
}

export function matchIngredientTemplates(query: string): IngredientTemplate[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return ingredientTemplates.filter((item) => item.name.toLocaleLowerCase().includes(normalized) || normalized.includes(item.name.toLocaleLowerCase()));
}



