import { md5 } from "@/lib/recipes/md5";

const gradients = [
  "from-brand via-brand/25 to-avocado",
  "from-avocado via-warning/45 to-brand",
  "from-warning via-brand/35 to-avocado",
  "from-brand via-warning/45 to-muted",
  "from-avocado via-brand/50 to-warning",
  "from-warning via-avocado/50 to-brand",
] as const;

export function recipePlaceholderGradient(name: string): (typeof gradients)[number] {
  const digest = md5(name.normalize("NFC"));
  const index = Number.parseInt(digest.slice(0, 8), 16) % gradients.length;
  return gradients[index]!;
}
