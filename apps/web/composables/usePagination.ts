/**
 * Composable for handling pagination state and operations
 * @param initialPage Initial page number
 * @returns Pagination state and methods
 */
export function usePagination(initialPage: number = 1) {
  // Ref for the current page
  const currentPage = ref(initialPage);

  // Method to update the current page
  function updatePage(page: number) {
    currentPage.value = page;
  }

  // Reset to the first page
  function resetPage() {
    currentPage.value = 1;
  }

  return {
    currentPage,
    updatePage,
    resetPage,
  };
}
