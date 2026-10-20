/**
 * Category cycle detection and hierarchy validation for M03-T03.
 *
 * Core owns the algorithm; SQL traversal/data retrieval is an adapter detail.
 * The detector consumes parent links from a repository port.
 */

export interface CategoryNode {
  id: string;
  bookId: string;
  parentCategoryId: string | null;
}

export class CategoryCycleDetector {
  /**
   * Detects if adding or updating a category would create a cycle.
   * Returns true if a cycle would be created.
   *
   * @param categoryId - The category being moved/updated
   * @param newParentId - The proposed new parent (null for root)
   * @param getCategory - Function to fetch a category by ID
   */
  async wouldCreateCycle(
    categoryId: string,
    newParentId: string | null,
    getCategory: (id: string) => Promise<CategoryNode | null>,
  ): Promise<boolean> {
    // Null parent means becoming root - no cycle possible
    if (newParentId === null) {
      return false;
    }

    // Self-parent check
    if (categoryId === newParentId) {
      return true;
    }

    // Traverse ancestor chain from newParentId
    const visited = new Set<string>();
    let currentId: string | null = newParentId;

    while (currentId !== null) {
      // Cycle detected if we reach the category being moved
      if (currentId === categoryId) {
        return true;
      }

      // Prevent infinite loops from corrupt data
      if (visited.has(currentId)) {
        return true;
      }

      visited.add(currentId);

      const node = await getCategory(currentId);
      if (!node) {
        // Parent doesn't exist - will fail validation elsewhere
        return false;
      }

      currentId = node.parentCategoryId;
    }

    return false;
  }

  /**
   * Gets all ancestor IDs for a category (excluding the category itself).
   * Returns empty array for root categories.
   */
  async getAncestors(
    categoryId: string,
    getCategory: (id: string) => Promise<CategoryNode | null>,
  ): Promise<string[]> {
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = categoryId;

    while (currentId !== null) {
      if (visited.has(currentId)) {
        // Corrupt data - stop traversal
        break;
      }

      visited.add(currentId);

      const node = await getCategory(currentId);
      if (!node || !node.parentCategoryId) {
        break;
      }

      ancestors.push(node.parentCategoryId);
      currentId = node.parentCategoryId;
    }

    return ancestors;
  }
}