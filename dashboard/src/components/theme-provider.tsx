import { createContext, type ReactNode, useContext, useEffect, useId, useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

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
	const id = useId()
	if (!context) throw new Error("ThemeProvider is required")
	return (
		<Field orientation="horizontal" className="w-auto">
			<FieldLabel htmlFor={id}>Tema</FieldLabel>
			<NativeSelect
				id={id}
				aria-label="Tema"
				value={context.theme}
				onChange={(event) => {
					const value = event.target.value
					if (value === "light" || value === "dark" || value === "auto")
						context.setTheme(value)
				}}
			>
				<NativeSelectOption value="auto">Sistema</NativeSelectOption>
				<NativeSelectOption value="light">Claro</NativeSelectOption>
				<NativeSelectOption value="dark">Escuro</NativeSelectOption>
			</NativeSelect>
		</Field>
	)
}
