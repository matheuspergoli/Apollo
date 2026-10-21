import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "./components/theme-provider"
import { TooltipProvider } from "./components/ui/tooltip"
import { createQueryClient } from "./lib/query"
import { createAppRouter } from "./router"
import "./styles.css"

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Elemento de montagem do Apollo não encontrado.")
createRoot(rootElement).render(
	<StrictMode>
		<ThemeProvider>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<RouterProvider router={router} />
				</TooltipProvider>
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>
)
