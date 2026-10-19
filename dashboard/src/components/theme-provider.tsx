import { createContext, type ReactNode, useContext, useEffect, useState } from "react"

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

export function ThemeSelect() {
	const context = useContext(ThemeContext)
	if (!context) throw new Error("ThemeProvider is required")
	return (
		<label className="flex items-center gap-2 text-muted-foreground text-xs">
			Tema
			<select
				aria-label="Tema"
				value={context.theme}
				onChange={(event) => context.setTheme(event.target.value as Theme)}
				className="min-h-10 border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="auto">Sistema</option>
				<option value="light">Claro</option>
				<option value="dark">Escuro</option>
			</select>
		</label>
	)
}
