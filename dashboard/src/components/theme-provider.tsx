import { createContext, type ReactNode, useContext, useEffect, useId, useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"

type Theme = "light" | "dark" | "auto"
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(
	null
)

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(() => {
		try {
			const saved = localStorage.getItem("theme")
			return saved === "light" || saved === "dark" ? saved : "auto"
		} catch {
			return "auto"
		}
	})
	useEffect(() => {
		const media = matchMedia("(prefers-color-scheme: dark)")
		const apply = () =>
			document.documentElement.classList.toggle(
				"dark",
				theme === "dark" || (theme === "auto" && media.matches)
			)
		apply()
		try {
			localStorage.setItem("theme", theme)
		} catch {
			/* Theme still works when storage is unavailable. */
		}
		media.addEventListener("change", apply)
		return () => media.removeEventListener("change", apply)
	}, [theme])
	return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>
}

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
	const context = useContext(ThemeContext)
	const id = useId()
	if (!context) throw new Error("ThemeProvider is required")
	return (
		<Field orientation="horizontal" className="w-auto">
			<FieldLabel htmlFor={id} className={compact ? "sr-only lg:not-sr-only" : undefined}>
				Tema
			</FieldLabel>
			<Select
				items={[
					{ value: "auto", label: "Sistema" },
					{ value: "light", label: "Claro" },
					{ value: "dark", label: "Escuro" }
				]}
				value={context.theme}
				onValueChange={(value) => {
					if (value === "light" || value === "dark" || value === "auto")
						context.setTheme(value)
				}}
			>
				<SelectTrigger
					id={id}
					aria-label="Tema"
					className={compact ? "w-24 min-w-0 sm:w-28" : "min-w-28"}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="auto">Sistema</SelectItem>
					<SelectItem value="light">Claro</SelectItem>
					<SelectItem value="dark">Escuro</SelectItem>
				</SelectContent>
			</Select>
		</Field>
	)
}
