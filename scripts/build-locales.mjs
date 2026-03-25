import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const templatePath = path.join(repoRoot, "templates", "landing.template.html");
const manifestPath = path.join(repoRoot, "locales", "manifest.json");

function escapeHtmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getNestedValue(object, keyPath) {
  return keyPath.split(".").reduce((value, segment) => (value ? value[segment] : undefined), object);
}

function serializeForInlineScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function applyI18nText(template, localeData) {
  const elementPattern = /(<([a-zA-Z0-9-]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g;
  return template.replace(elementPattern, (match, openTag, _tagName, keyPath, _innerText, closeTag) => {
    const translated = getNestedValue(localeData, keyPath);
    if (typeof translated !== "string") {
      throw new Error(`Missing string translation for data-i18n key "${keyPath}"`);
    }
    return `${openTag}${escapeHtmlText(translated)}${closeTag}`;
  });
}

function applyPlaceholderText(template, localeData) {
  const placeholderPattern = /<([a-zA-Z0-9-]+)\b([^>]*\sdata-i18n-placeholder="([^"]+)"[^>]*)>/g;
  return template.replace(placeholderPattern, (match, tagName, attrs, keyPath) => {
    const translated = getNestedValue(localeData, keyPath);
    if (typeof translated !== "string") {
      throw new Error(`Missing string translation for data-i18n-placeholder key "${keyPath}"`);
    }

    const nextAttrs = /placeholder="[^"]*"/.test(attrs)
      ? attrs.replace(/placeholder="[^"]*"/, `placeholder="${escapeHtmlAttr(translated)}"`)
      : `${attrs} placeholder="${escapeHtmlAttr(translated)}"`;

    return `<${tagName}${nextAttrs}>`;
  });
}

function stripI18nAttributes(template) {
  return template
    .replace(/\sdata-i18n="[^"]*"/g, "")
    .replace(/\sdata-i18n-placeholder="[^"]*"/g, "");
}

function buildLocaleRoutes(routesByLocale) {
  const mapped = {};
  for (const [localeCode, routeSlug] of Object.entries(routesByLocale)) {
    mapped[localeCode] = `/${routeSlug}`;
  }
  return mapped;
}

// Language switcher options are generated from manifest.localeLabels + manifest.routes.
// This avoids hardcoded options in HTML drifting when locales are added/renamed.
function buildLanguageOptions(localeCodes, localeLabels, selectedLocale) {
  return localeCodes
    .map((localeCode) => {
      const label = localeLabels?.[localeCode] || localeCode;
      const selected = localeCode === selectedLocale ? " selected" : "";
      return `<option value="${escapeHtmlAttr(localeCode)}"${selected}>${escapeHtmlText(label)}</option>`;
    })
    .join("\n            ");
}

async function main() {
  const [template, manifestRaw] = await Promise.all([
    fs.readFile(templatePath, "utf8"),
    fs.readFile(manifestPath, "utf8")
  ]);

  const manifest = JSON.parse(manifestRaw);
  // manifest is the single source of truth for:
  // - route mapping (routes)
  // - switcher labels (localeLabels)
  // - per-locale typeface stack (fontStacks)
  // - per-locale typography tuning (typography)
  const localeCodes = Object.keys(manifest.routes || {});
  if (!localeCodes.length) {
    throw new Error("No locales defined in locales/manifest.json routes.");
  }

  const localeRoutes = buildLocaleRoutes(manifest.routes);
  const defaultFontStacks = manifest.fontStacks?.default || {
    display: "\"Libre Caslon Text\", Georgia, serif",
    body: "\"Libre Caslon Text\", Georgia, serif"
  };
  const defaultTypography = manifest.typography?.default || {
    weightRegular: "400",
    weightSemibold: "600",
    weightBold: "700",
    featureTitleWeight: "400",
    featureLabelScale: "1",
    faqQuestionWeight: "400",
    labelScale: "1",
    subtitleScale: "1"
  };

  for (const localeCode of localeCodes) {
    const routeSlug = manifest.routes[localeCode];
    const localePath = path.join(repoRoot, "locales", `${localeCode}.json`);
    const localeRaw = await fs.readFile(localePath, "utf8");
    const localeData = JSON.parse(localeRaw);
    const languageOptions = buildLanguageOptions(localeCodes, manifest.localeLabels, localeCode);

    let output = template;
    output = applyI18nText(output, localeData);
    output = applyPlaceholderText(output, localeData);
    output = stripI18nAttributes(output);

    const title = manifest.titles?.[localeCode] || manifest.titles?.[manifest.defaultLocale] || "tenio beta";
    const formMessages = {
      validation: localeData.validation || {},
      signup: { submit: localeData.signup?.submit || {} }
    };
    const localeFontStacks = manifest.fontStacks?.[localeCode] || defaultFontStacks;
    const fontDisplayStack = typeof localeFontStacks.display === "string" ? localeFontStacks.display : defaultFontStacks.display;
    const fontBodyStack = typeof localeFontStacks.body === "string" ? localeFontStacks.body : defaultFontStacks.body;
    const localeTypography = manifest.typography?.[localeCode] || defaultTypography;
    const weightRegular = typeof localeTypography.weightRegular === "string" ? localeTypography.weightRegular : defaultTypography.weightRegular;
    const weightSemibold = typeof localeTypography.weightSemibold === "string" ? localeTypography.weightSemibold : defaultTypography.weightSemibold;
    const weightBold = typeof localeTypography.weightBold === "string" ? localeTypography.weightBold : defaultTypography.weightBold;
    const featureTitleWeight = typeof localeTypography.featureTitleWeight === "string" ? localeTypography.featureTitleWeight : defaultTypography.featureTitleWeight;
    const featureLabelScale = typeof localeTypography.featureLabelScale === "string" ? localeTypography.featureLabelScale : defaultTypography.featureLabelScale;
    const faqQuestionWeight = typeof localeTypography.faqQuestionWeight === "string" ? localeTypography.faqQuestionWeight : defaultTypography.faqQuestionWeight;
    const labelScale = typeof localeTypography.labelScale === "string" ? localeTypography.labelScale : defaultTypography.labelScale;
    const subtitleScale = typeof localeTypography.subtitleScale === "string" ? localeTypography.subtitleScale : defaultTypography.subtitleScale;
    // Locale-specific asset injection: keep heavyweight CJK font payload scoped to zh-CN.
    // The active file below is intentionally a subset WOFF2 (same filename expected by template).
    // If zh-CN content adds new glyphs, regenerate the subset and overwrite this same path:
    //   /fonts/SourceHanSerifSC-VF.otf.woff2
    // Optional full backup (not loaded by current CSS): /fonts/SourceHanSerifSC-VF.full-backup.otf.woff2
    // To add another locale-specific font asset, extend this branch or generalize by manifest.
    const isChineseLocale = localeCode === "zh-CN";
    const cnFontPreload = isChineseLocale
      ? '<link rel="preload" href="/fonts/SourceHanSerifSC-VF.otf.woff2" as="font" type="font/woff2" crossorigin>'
      : "";
const cnFontFace = isChineseLocale
      ? `@font-face {
  font-family: "Tenio Source Han Serif SC";
  font-weight: 300 900;
  font-style: normal;
  font-display: block;
  src:
    local("Source Han Serif SC"),
    local("Source Han Serif CN"),
    url("/fonts/SourceHanSerifSC-VF.otf.woff2") format("woff2");
}`
      : "";

    output = output.replaceAll("__HTML_LANG__", localeCode);
    output = output.replaceAll("__PAGE_TITLE__", title);
    output = output.replaceAll("__LOCALE_CODE__", localeCode);
    // Template tokens below are build-time substitutions.
    // Generated pages are static and should not contain unresolved __TOKENS__.
    output = output.replaceAll("__CN_FONT_PRELOAD__", cnFontPreload);
    output = output.replaceAll("__CN_FONT_FACE__", cnFontFace);
    output = output.replaceAll("__LANGUAGE_OPTIONS__", languageOptions);
    output = output.replaceAll("__LOCALE_ROUTES_JSON__", serializeForInlineScript(localeRoutes));
    output = output.replaceAll("__FORM_MESSAGES_JSON__", serializeForInlineScript(formMessages));
    output = output.replaceAll("__FONT_DISPLAY_STACK__", fontDisplayStack);
    output = output.replaceAll("__FONT_BODY_STACK__", fontBodyStack);
    output = output.replaceAll("__WEIGHT_REGULAR__", weightRegular);
    output = output.replaceAll("__WEIGHT_SEMIBOLD__", weightSemibold);
    output = output.replaceAll("__WEIGHT_BOLD__", weightBold);
    output = output.replaceAll("__FEATURE_TITLE_WEIGHT__", featureTitleWeight);
    output = output.replaceAll("__FEATURE_LABEL_SCALE__", featureLabelScale);
    output = output.replaceAll("__FAQ_QUESTION_WEIGHT__", faqQuestionWeight);
    output = output.replaceAll("__LABEL_SCALE__", labelScale);
    output = output.replaceAll("__SUBTITLE_SCALE__", subtitleScale);

    const outDir = path.join(repoRoot, routeSlug);
    const outPath = path.join(outDir, "index.html");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outPath, output, "utf8");
  }

  console.log(`Generated locale pages: ${localeCodes.map((code) => `/${manifest.routes[code]}`).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
