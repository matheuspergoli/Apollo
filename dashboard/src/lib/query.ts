import { QueryClient } from "@tanstack/react-query"

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 },
			mutations: { retry: false, gcTime: 0 }
		}
	})
}
