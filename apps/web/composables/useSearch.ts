import { useDebounceFn } from "@vueuse/core";

/**
 * Composable for handling search functionality with debouncing
 * @param initialQuery Initial search query string
 * @returns Search state and methods
 */
export function useSearch(initialQuery: string = "") {
  // Refs for handling search input and query state
  const inputSearchQuery = ref(initialQuery);
  const searchQuery = ref(initialQuery);

  // Debounced function to update the search query
  const debouncedSearch = useDebounceFn((value: string) => {
    searchQuery.value = value;
  }, 500);

  // Clear the search input and query
  function clearSearch() {
    inputSearchQuery.value = "";
    searchQuery.value = "";
  }

  return {
    inputSearchQuery,
    searchQuery,
    debouncedSearch,
    clearSearch,
  };
}
