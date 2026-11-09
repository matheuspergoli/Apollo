import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createPrototypeState } from "./model"
import { ResourcesPreview } from "./preview"
import "../../styles.css"

// This separate dev HTML entry is never imported by the production application.
if (!import.meta.env.DEV)
	throw new Error("O protótipo só pode ser aberto no servidor de desenvolvimento.")
const element = document.getElementById("root")
if (!element) throw new Error("Elemento de montagem do protótipo não encontrado.")
const initial = await createPrototypeState()
createRoot(element).render(
	<StrictMode>
		<ThemeProvider>
			<TooltipProvider>
				<ResourcesPreview initial={initial} />
			</TooltipProvider>
		</ThemeProvider>
	</StrictMode>
)
