export interface RecipeImageAsset {
  name: string;
  image_url: string;
}

export function validateRecipeImageAssets(recipes: RecipeImageAsset[], publicRecipesDirectory: string): void;
