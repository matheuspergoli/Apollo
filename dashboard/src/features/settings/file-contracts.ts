import { z } from "zod"

const values = z.record(z.string(), z.unknown())
export const sectionFileSchema = z.strictObject({
	format: z.literal("apollo-settings-section"),
	version: z.literal(1),
	section: z.string().min(1),
	settings: values
})
export const globalFileSchema = z.strictObject({
	format: z.literal("apollo-settings"),
	version: z.literal(1),
	kind: z.enum(["saved", "defaults"]),
	platform: z.enum(["windows", "linux", "unknown"]),
	sections: z.record(z.string(), values)
})
