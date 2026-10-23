import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

for (const { width, theme } of [390, 768, 1440, 1920].flatMap((width) =>
	["light", "dark"].map((theme) => ({ width, theme }))
)) {
	test(`editor action bars align with cards at ${width}px in ${theme}`, async ({ page }) => {
		await mockHost(page)
		await page.setViewportSize({ width, height: 900 })
		await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme)
		for (const editor of [
			{
				path: "/pin",
				edit: "Editar permissões",
				save: "Salvar dispositivo",
				input: "#device-name"
			},
			{ path: "/apps", edit: "Editar", save: "Salvar aplicativo", input: "#app-name" },
			{ path: "/config", edit: "", save: "Revisar e salvar", input: "#sunshine_name" }
		]) {
			await page.goto(editor.path)
			if (editor.edit)
				await page.getByRole("button", { name: editor.edit, exact: true }).click()
			await expect(page.locator(editor.input)).toBeVisible()
			const card = page.locator('[data-slot="card"]').filter({
				has:
					editor.path === "/config"
						? page.getByRole("button", { name: "Baixar template completo", exact: true })
						: page.locator(editor.input)
			})
			const actions = page
				.locator(".sticky")
				.filter({ has: page.getByRole("button", { name: editor.save, exact: true }) })
			await expect(actions).toBeVisible()
			const cardBox = await card.boundingBox()
			const actionBox = await actions.boundingBox()
			if (!cardBox || !actionBox) throw new Error("Missing editor geometry")
			expect(Math.abs(cardBox.x - actionBox.x)).toBeLessThanOrEqual(0.5)
			expect(
				Math.abs(cardBox.x + cardBox.width - actionBox.x - actionBox.width)
			).toBeLessThanOrEqual(0.5)
			const cardStyle = await card.evaluate((element) => {
				const style = getComputedStyle(element)
				const header = element.querySelector('[data-slot="card-header"]')
				if (!header) throw new Error("Missing editor card header")
				return {
					ring: style.getPropertyValue("--tw-ring-shadow"),
					border: style.borderLeftWidth,
					padding: getComputedStyle(header).paddingRight
				}
			})
			const actionStyle = await actions.evaluate((element) => {
				const style = getComputedStyle(element)
				return {
					ring: style.getPropertyValue("--tw-ring-shadow"),
					border: style.borderLeftWidth,
					padding: style.paddingRight,
					left: style.paddingLeft,
					top: style.paddingTop,
					bottom: style.paddingBottom,
					z: style.zIndex
				}
			})
			expect(actionStyle.ring).toBe(cardStyle.ring)
			expect(actionStyle.border).toBe(cardStyle.border)
			expect(actionStyle.padding).toBe(cardStyle.padding)
			expect(actionStyle.left).toBe(actionStyle.padding)
			expect(actionStyle.top).toBe(actionStyle.bottom)
			expect(actionStyle.z).toBe("20")
			const horizontalAlignment = () =>
				card.evaluate((element) => {
					const bar = document.querySelector('[data-slot="editor-actions"]')
					if (!bar) throw new Error("Missing editor action bar")
					const reference = element.getBoundingClientRect()
					const actions = bar.getBoundingClientRect()
					return Math.max(
						Math.abs(reference.left - actions.left),
						Math.abs(reference.right - actions.right)
					)
				})
			await page.evaluate(() => window.scrollBy(0, 600))
			await expect.poll(horizontalAlignment).toBeLessThanOrEqual(0.5)
			if (width >= 768) {
				const toggle = page.getByRole("button", { name: "Alternar navegação", exact: true })
				await toggle.click()
				await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
					"data-state",
					"collapsed"
				)
				await page.locator('[data-slot="sidebar-gap"]').evaluate(async (element) => {
					await Promise.all(
						element
							.getAnimations()
							.map((animation) => animation.finished.catch(() => undefined))
					)
				})
				await expect.poll(horizontalAlignment).toBeLessThanOrEqual(0.5)
				await toggle.click()
				await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
					"data-state",
					"expanded"
				)
				await page.locator('[data-slot="sidebar-gap"]').evaluate(async (element) => {
					await Promise.all(
						element
							.getAnimations()
							.map((animation) => animation.finished.catch(() => undefined))
					)
				})
				await expect.poll(horizontalAlignment).toBeLessThanOrEqual(0.5)
			}
			if (editor.path !== "/config") {
				const save = page.getByRole("button", { name: editor.save, exact: true })
				await save.focus()
				await expect(save).toBeFocused()
			}
			const buttonSpacing = await actions.evaluate((element) => {
				const buttons = Array.from(element.querySelectorAll("button"), (button) =>
					button.getBoundingClientRect()
				)
				const last = buttons.at(-1)
				if (!last) throw new Error("Missing editor actions")
				return {
					lastInset: element.getBoundingClientRect().right - last.right,
					gaps: buttons
						.slice(1)
						.flatMap((button, index) =>
							Math.abs(button.top - buttons[index].top) <= 0.5
								? [button.left - buttons[index].right]
								: []
						)
				}
			})
			expect(
				Math.abs(buttonSpacing.lastInset - Number.parseFloat(actionStyle.padding))
			).toBeLessThanOrEqual(0.5)
			for (const gap of buttonSpacing.gaps) expect(Math.abs(gap - 8)).toBeLessThanOrEqual(0.5)
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
			).toBe(true)
			await expect(
				page.getByText("Apollo · instalação de teste", { exact: true })
			).toHaveCount(0)
			await expect(page.getByText("Código e proveniência", { exact: true })).toHaveCount(0)
			await expect(page.getByRole("contentinfo")).toHaveCount(0)
			await page.screenshot({
				path: `/tmp/opencode/apollo-editor-${editor.path.slice(1)}-${theme}-${width}.png`,
				fullPage: false
			})
		}
	})
}
