type RecipeCoverInput = { imageUrl?: string | null; image_url?: string | null };

export function recipeWriteData<T extends RecipeCoverInput>(input: T) {
  const { imageUrl, image_url, ...data } = input;
  const cover = imageUrl !== undefined ? imageUrl : image_url;
  return { ...data, imageUrl: cover === "" ? null : cover };
}

export function serializeRecipe<T extends { imageUrl: string | null }>(recipe: T) {
  const imageUrl = recipe.imageUrl || null;
  return { ...recipe, imageUrl, image_url: imageUrl ?? "" };
}

export function serializePlan<T extends { recipe: { imageUrl: string | null } | null }>(plan: T) {
  return { ...plan, recipe: plan.recipe ? serializeRecipe(plan.recipe) : null };
}
