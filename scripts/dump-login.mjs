import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("https://2set.com/", { waitUntil: "networkidle" });
const form = await p.locator("form").first().evaluate(el => el.outerHTML);
console.log(form.replace(/class="[^"]*"/g, 'class="..."'));
console.log("\n--- inputs ---");
for (const h of await p.locator("input").all()) {
  console.log(JSON.stringify({
    type: await h.getAttribute("type"),
    placeholder: await h.getAttribute("placeholder"),
    id: await h.getAttribute("id"),
    name: await h.getAttribute("name"),
  }));
}
await b.close();
