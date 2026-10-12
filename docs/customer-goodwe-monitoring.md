# GoodWe customer monitoring link

The full customer portal shows **Open GoodWe SEMS+** in **Your solar system** when any system's inverter, monitoring or monitorPlatform field identifies GoodWe or SEMS. It uses the fields already included in customer snapshots. Quote-only customers retain their existing restricted view. Other brands and missing system records do not show the GoodWe link.

The link opens `https://eu-semsplus.goodwe.com/` in a new tab with `noopener noreferrer`. Customers sign in using their own GoodWe accounts. No customer identifiers, credentials or CS Energy session data are added to the URL. This is an external monitoring link, with no monitoring API or authentication changes.

## Official destination, checked 12 October 2026

- [GoodWe Europe SEMS page](https://emea.goodwe.com/sems-series-smart-energy-management-system) describes SEMS+ and links its Support & Service → Monitoring item to the European SEMS+ portal.
- [European SEMS+ portal](https://eu-semsplus.goodwe.com/)
- [Legacy SEMS Portal](https://www.semsportal.com/Home/Login) contains a platform service-discontinuation notice directing customers to SEMS+.

## Checks

Run from the repository root:

```
node --test tests/customer-goodwe.test.cjs tests/assistant.test.js
node tests/customer-goodwe-ui.cjs
git diff --check
```

The browser test requires Playwright and Chromium. Set `CHROMIUM_PATH` if using a system browser. It uses synthetic records and a mocked GoodWe destination; it never signs into CS Energy or GoodWe or makes customer changes. It covers desktop, 390px and 320px layouts, keyboard focus, minimum touch-target size, repeated opens, no opener access, retained form state, customer switching, and quote/full view behavior.

Implementation verification: all 25 Node tests passed, all repository JavaScript and inline scripts parsed, and the diff whitespace check passed. Browser automation could not launch in the implementation environment because Chromium's socket operation was restricted; the cloud browser also disallowed the local file preview. Browser/layout checks and signed-in production verification remain unverified.
