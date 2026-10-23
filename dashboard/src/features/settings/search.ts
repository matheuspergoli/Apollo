import { normalizeSearch } from "@/lib/search"
import { type SettingSection, settingOptions } from "./model"

export function searchSettings(groups: SettingSection[], query: string, platform = "") {
	if (query.length > 256) return []
	const phrase = normalizeSearch(query)
	const terms = [...new Set(phrase.split(" ").filter(Boolean))]
	if (!terms.length) return []
	return groups
		.flatMap((group) =>
			group.fields.map((field) => {
				const label = normalizeSearch(field.label)
				const key = normalizeSearch(field.key)
				const section = normalizeSearch(group.title)
				const description = normalizeSearch(field.description)
				const options = normalizeSearch(
					(settingOptions(field, platform) || [])
						.map((option) => `${option.label} ${option.value}`)
						.join(" ")
				)
				const content = `${label} ${key} ${section} ${description} ${options}`
				if (!terms.every((term) => content.includes(term))) return null
				const score =
					(label === phrase ? 120 : 0) +
					(key === phrase ? 110 : 0) +
					(label.startsWith(phrase) ? 40 : 0) +
					(key.startsWith(phrase) ? 35 : 0) +
					terms.reduce(
						(total, term) =>
							total +
							(label.split(" ").includes(term) ? 20 : label.includes(term) ? 12 : 0) +
							(key.includes(term) ? 15 : 0) +
							(section.includes(term) ? 4 : 0) +
							(options.includes(term) ? 2 : 0) +
							(description.includes(term) ? 1 : 0),
						0
					)
				return { group, field, score }
			})
		)
		.filter((result) => result !== null)
		.sort((left, right) => right.score - left.score)
}
