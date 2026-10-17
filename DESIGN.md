# DoğruAdres Design Language

## 1. Document status

**PROPOSED — AWAITING PRODUCT-OWNER APPROVAL**

This document records visual evidence from the existing DoğruAdres Stitch project and separates observed stylistic characteristics, product-owner preferences, recommendations, and unknowns. It is not an approved production design specification. No styling value, font, palette, layout, or component recommendation in this document is approved merely by being recorded here.

Labels used throughout:

- **OBSERVED** — directly present in Stitch project metadata, screen images, or retrieved screen HTML.
- **INFERRED** — a recurring pattern reasonably concluded from more than one Stitch artifact.
- **PROPOSED** — a recommendation for a coherent future platform.
- **UNKNOWN** — not established by the available Stitch evidence.

## 2. Purpose and scope

This document captures stylistic characteristics and product-owner visual preferences communicated by exploratory Stitch experiments, then proposes how a shared design language might extend across the platform. The Stitch screens are look-and-feel references only.

### Design reference policy

- Existing Stitch screens are exploratory stylistic references, not approved final product screens, layouts, information architecture, workflows, or implementation blueprints.
- Their screen content must not be used to infer DoğruAdres business requirements, feature scope, permissions, navigation, or interaction behavior.
- No existing Stitch screen should be copied into production merely because it appears in the project.
- Future application screens must be designed anew for actual DoğruAdres requirements, using approved functional briefs and relevant stylistic references as separate inputs.
- A product owner must approve future screen designs before implementation. Approval of a visual reference or general style does not approve a screen’s function, layout, workflow, or interaction design.
- This document is a proposal awaiting product-owner approval; recording observed or proposed characteristics here does not make them approved production decisions.

This document does not define product permissions, business behavior, application architecture, implementation technology, or final interaction specifications. Static screen artifacts do not prove interactive behavior.

## 3. Stitch projects and screens inspected

**OBSERVED — Project:** `DogruAdres`, private Stitch project, project ID `7913908371982548216`, desktop project theme.

**OBSERVED — Project theme metadata:** light mode, Inter, custom color `#137fec`, roundness `ROUND_EIGHT`.

The following eight accessible screen records were retrieved from the project:

| Screen title in Stitch | Screen ID | Evidence reviewed |
|---|---|---|
| Muhasebe Kontrol Paneli | `f4c5c0eb13d54b19aa5838e0acb5979b` | Screen metadata, screenshot, HTML metadata/styles |
| Müşteri Ekle/Düzenle Formu | `77dfca49bd3a44d2b5a5b6e5bbe7045c` | Screen metadata, HTML metadata/styles |
| Muhasebe Kontrol Paneli | `6c612991cc274b9bb75a15d82e6a0508` | Screen metadata, HTML metadata/styles |
| Muhasebe Kontrol Paneli | `1f203b23ef6f42b89cf3bda4913e6cce` | Screen metadata, HTML metadata/styles |
| DoğruAdres.net Tanıtım Sayfası | `60da13704baf4b50911287728918b300` | Screen metadata and screenshot |
| Müşteri Ekle/Düzenle Formu | `7f92fb29256f452cad7c2b304e4db8cc` | Screen metadata |
| Muhasebe Kontrol Paneli | `a6ae713003da4d9f8de02b8b8bac14cb` | Screen metadata, HTML metadata/styles |
| Split Screen Giriş Sayfası - Sosyal Login Güncellemesi | `f120556870d54b19aa5838e0acb5979b` | Screen metadata, screenshot, HTML metadata/styles |

Retrieved screen records are desktop, with source dimensions commonly reported as 2560 pixels wide; the project instances are 1280 pixels wide. The browser-rendered screenshot previews were inspected for the accounting dashboard, split-screen login, and long-form landing page. HTML was retrieved for representative dashboard, invoice, customer, and login designs.

These screens identify the evidence set and provide stylistic reference only; their titles and content do not establish approved product screens or workflows. The separate Stitch design-system listing for this project returned no design-system asset. The project-level theme metadata is available and is recorded above, but is not an approved production token set.

## 4. Evidence and source references

All evidence in this document comes from the Stitch connection:

- Project: `projects/7913908371982548216` (`DogruAdres`)
- Screen resources: the eight IDs listed in Section 3
- Stitch project theme metadata and available screen screenshots/HTML

No application implementation or third-party design system was used as evidence. Some linked screen HTML has an internal page title that does not agree with the Stitch screen title; those conflicts are called out in Section 22. Screenshots or code that could not be reliably inspected are not treated as proof of details.

## 5. Observed stylistic characteristics and inferred atmosphere

- **OBSERVED:** The project is explicitly configured as a light theme with Inter, a strong blue custom color, and medium roundedness.
- **OBSERVED:** The accounting dashboard preview uses a pale neutral page canvas, white content surfaces, a top navigation bar, financial summary cards, a blue line/area chart, notification content, and a recent-activity table.
- **OBSERVED:** The login preview uses a split composition: a saturated blue automotive brand panel and a white sign-in form panel.
- **OBSERVED:** The marketing page uses a light corporate landing-page structure and includes a distinct dark section. That section is a page-level contrast, not evidence of a global dark application theme.
- **INFERRED:** The visual atmosphere communicated across the experiments is professional, approachable, information-oriented, and blue-led. It combines generous whitespace and rounded cards with practical dashboard density. This describes a stylistic preference, not an approved visual identity or screen design.
- **UNKNOWN:** Whether the login's automotive photography, social sign-in providers, or landing-page dark section are approved platform-wide brand requirements.

## 6. Design principles

1. **PROPOSED — Respect the referenced atmosphere.** Use the light, blue-led, neutral-surface experiments as visual inspiration, not as mandatory screen layouts or a finalized brand system.
2. **PROPOSED — One platform, contextual workspaces.** Keep shared navigation, typography, controls, and feedback patterns consistent across organization, marketplace, and operations modules.
3. **PROPOSED — Role-aware, not role-fragmented.** Permissions and organization context may change available tasks; they should not create unrelated visual products.
4. **PROPOSED — Information hierarchy before decoration.** Financial and operational values, their status, and the next action should be easy to distinguish.
5. **PROPOSED — Semantic color.** Use color consistently for action, status, and data visualization; never rely on color alone.
6. **PROPOSED — Direction-aware by construction.** Support Turkish, English, and Arabic using logical layout rules, not a late visual mirroring pass.
7. **PROPOSED — Evidence-led evolution.** Treat a new visual direction as a design decision requiring review, not as an accidental screen-by-screen divergence.

## 7. Observed design tokens

| Token/property | Evidence | Status |
|---|---|---|
| Theme mode | Stitch project theme says `LIGHT`; sampled HTML declares `class="light"` | **OBSERVED** |
| Primary/custom color | Project custom color `#137fec`; used by blue actions and chart accents in retrieved HTML | **OBSERVED** |
| Alternative blues | Customer-related HTML includes `#0071e3` and `#0077ed` | **OBSERVED — visual variant/conflict** |
| Light canvas | `#f5f5f7` appears in dashboard/customer HTML and dashboard preview | **OBSERVED** |
| Surface | `#ffffff` appears in retrieved HTML and screenshots | **OBSERVED** |
| Primary text | `#1d1d1f` and `#101922` appear in retrieved HTML | **OBSERVED — variant** |
| Muted text | `#86868b` appears in retrieved HTML | **OBSERVED** |
| Borders | `#d1d5db` and `#d2d2d7` appear in retrieved HTML | **OBSERVED — variant** |
| Typeface | Stitch project theme specifies `INTER`; retrieved page HTML includes Inter | **OBSERVED** |
| Roundness | Project theme specifies `ROUND_EIGHT`; screen HTML uses `rounded-lg`, `rounded-xl`, and `rounded-2xl` | **OBSERVED — not a single radius value** |
| Spacing | Retrieved HTML uses padding/gap classes including `p-4/5/6`, `gap-3/4/6`, and `px-6/8` | **OBSERVED — recurring values, not a formal scale** |
| Breakpoints | Retrieved HTML contains `sm:`, `md:`, and `lg:` responsive classes | **OBSERVED — exact intended breakpoint behavior is not verified** |
| Shadow/elevation tokens | Cards appear layered in screenshots; no reusable elevation scale was found | **UNKNOWN** |
| Semantic success/warning/error palette | Colored status indicators and financial changes are visible, but no stable token definitions were found | **UNKNOWN** |

## 8. Proposed semantic token structure

All token names and structures in this section are **PROPOSED**, not extracted Stitch tokens. Keep raw palette values behind semantic names so light/dark themes and module surfaces can evolve without screen-specific color decisions. No values become approved constants through this proposal.

| Semantic token | Intended use |
|---|---|
| `color.action.primary` | Primary action, active navigation, key links |
| `color.action.primary.hover` / `.pressed` / `.disabled` | Action states |
| `color.text.primary` / `.secondary` / `.muted` / `.inverse` | Text hierarchy |
| `color.surface.canvas` / `.raised` / `.overlay` / `.sunken` | Page, cards, dialogs, inset regions |
| `color.border.default` / `.strong` / `.focus` | Structure and keyboard focus |
| `color.status.success` / `.warning` / `.danger` / `.info` | Status, validation, notices |
| `color.data.series.*` | Distinguishable chart series with non-color cues where needed |
| `color.interactive.selected` | Selected rows, tabs, filters, and list items |

**PROPOSED:** Evaluate `#137fec` as one candidate for the light-theme primary action. Resolve the observed `#0071e3`/`#0077ed` variants with the product owner before choosing a production value.

## 9. Typography

- **OBSERVED:** Inter is the project theme typeface and appears in retrieved screen HTML.
- **INFERRED:** The screenshots use a modern sans-serif hierarchy with prominent page headings, compact navigation/labels, and clearly emphasized financial totals.
- **PROPOSED:** Establish a small shared type scale for display/page headings, section headings, body, labels, helper text, and tabular numeric values. Use weight, size, and spacing consistently; do not use color as the only hierarchy cue.
- **PROPOSED:** Use tabular numerals for aligned financial amounts and dense numeric tables where available.
- **UNKNOWN:** Arabic typeface choice, exact font sizes/weights, and line-height tokens. Validate Arabic glyph shaping and Turkish diacritics before approval; do not assume Inter alone is sufficient for every script.

## 10. Spacing, layout, and breakpoints

- **OBSERVED:** Retrieved HTML uses multiple spacing values, including common `p-4`, `p-5`, `p-6`, `gap-3`, `gap-4`, `gap-6`, `px-6`, and `px-8`; forms include multi-column grids.
- **INFERRED:** Dashboard layout uses a broad content area, distinct card groupings, and whitespace to separate financial summary, alerts, and activity.
- **PROPOSED:** Consolidate spacing into a documented scale and use a consistent content gutter. Keep dense data tables compact while preserving comfortable touch targets and clear row separation.
- **OBSERVED:** `sm:`, `md:`, and `lg:` variants are present in HTML.
- **UNKNOWN:** Actual responsive layouts and exact breakpoint values; the inspected screenshot set is desktop-oriented.
- **PROPOSED:** Define desktop, tablet, and mobile behavior per component. Collapse multi-column cards and forms progressively; do not merely scale down a desktop table or sidebar.

## 11. Color, surfaces, and elevation

- **OBSERVED:** The dashboard preview contrasts a light-gray canvas with white cards and a vivid blue chart/action accent. The login screen uses a much larger saturated blue brand area.
- **INFERRED:** The normal app workspace should use blue as a focused accent, not as the background for every surface.
- **PROPOSED:** Establish distinct canvas, raised-card, inset, and overlay surfaces in each theme. Use borders and restrained shadows to distinguish levels; avoid combining strong shadows and heavy borders on every card.
- **PROPOSED:** Reserve success, warning, danger, and informational hues for meaning. Financial gains/losses must include signs or labels in addition to color.
- **UNKNOWN:** Existing elevation levels, overlay opacity, and exact semantic-status colors.

## 12. Component design recommendations

| Component | Stitch evidence | Proposed follow-up / status |
|---|---|---|
| Dashboard cards | Summary cards and a larger balance/chart card are visible | **OBSERVED**; define shared padding, heading, value, comparison, and optional action slots |
| Forms | Login fields/buttons and customer form HTML are present | **OBSERVED**; exact validation/focus/error states are **UNKNOWN** |
| Tables | Recent-activity table is visible | **OBSERVED**; define density variants, sortable/filterable affordances only when required |
| Status chips | Small status labels and colored indicators appear | **OBSERVED**; always pair color with readable text/icon |
| Notification center | Dashboard preview shows a notification summary panel and bell indicator | **OBSERVED**; expanded panel behavior is **UNKNOWN** |
| Modals/drawers | No representative open modal or drawer was inspected | **UNKNOWN** |
| Autocomplete/combobox | No interaction state was inspected | **UNKNOWN** |
| Charts | Financial trend and compact chart graphics are visible | **OBSERVED**; accessibility, tooltip, and keyboard behavior are **UNKNOWN** |
| Feedback messages | Status and notice content is visible in static screens | **OBSERVED**; loading, success, validation, and failure patterns need definition |

**PROPOSED:** Provide consistent default, hover, focus-visible, active, disabled, loading, empty, error, and success states where a component needs them. This is a recommendation, not a claim about existing Stitch interactions.

## 13. Navigation and application shell recommendations

- **OBSERVED:** The accounting dashboard shows a light horizontal top navigation with product identity, several destinations, search, notification, and user avatar. The login screen has a separate split-screen composition.
- **UNKNOWN:** A unified application launcher, organization switcher, role-aware sidebar, mobile navigation, and platform-operations shell are not established by the inspected screens.
- **PROPOSED:** Use a common shell with product identity, current organization/context, app/module navigation, global search where approved, notifications, and user/account controls. Provide a clear place to switch organization and access the application launcher.
- **PROPOSED:** Keep module-specific navigation and work areas inside this shell. Show only destinations the current role can use, but preserve the same shell and interaction grammar for platform staff and organization users.
- **PROPOSED:** On narrow screens, replace persistent desktop navigation with a compact, accessible navigation pattern; do not simply hide destinations without an alternate route.

## 14. Light-theme observations and proposed direction

The light theme is the best-supported observed stylistic reference. This is not an approved production theme or screen specification.

- **OBSERVED:** Light canvas around `#f5f5f7`, white surfaces, Inter, and blue accent. Project theme specifies `#137fec` and `ROUND_EIGHT`.
- **OBSERVED:** Screens also contain `#0071e3`/`#0077ed` blue variants, `#1d1d1f`/`#101922` text variants, and two border shades.
- **INFERRED:** A pale neutral canvas and white cards with blue actions are recurring stylistic characteristics in the dashboard and sign-in references.
- **PROPOSED:** Keep the blue accent for primary actions and active states; use neutral text and surfaces for most of the information hierarchy. Normalize the competing blue and neutral variants before implementation.
- **UNKNOWN:** A complete approved light-theme token set, contrast measurements, and formal component state colors.

## 15. Proposed dark-theme specification

The project’s retrieved theme metadata and representative screens establish a light theme; no existing DoğruAdres dark theme was inspected. Everything below is **PROPOSED**.

- Preserve the same blue-led identity and hierarchy; do not invert every light color.
- Use a deep neutral canvas, slightly elevated card surfaces, a distinct overlay surface, and subtle borders.
- Lighten the primary blue only as needed for text/icon contrast on dark surfaces.
- Keep primary text high-contrast and secondary text readable; do not use low-contrast gray for essential data.
- Give status colors dark-surface variants and never encode financial meaning using color alone.
- Define chart series with accessible contrast, line/marker distinctions, and readable axes/tooltips.
- Test dialogs, dense tables, selected rows, disabled controls, validation, and focus rings independently.

Candidate palette for design exploration only: canvas `#0D1117`, surface `#151B23`, raised surface `#1C2430`, border `#2D3847`, primary text `#F3F6FA`, secondary text `#AAB6C5`, and accent blue `#4D9BFF`. These are **PROPOSED values**, not observations or approved tokens. Validate contrast and visual harmony before adoption.

## 16. Localization and RTL

The platform must support Turkish (`tr-TR`), English (`en`), and Modern Standard Arabic (`ar`), with full RTL support and multi-currency display.

- **PROPOSED:** Set document and component direction from the active locale. Arabic requires real RTL layout support, not just translated strings.
- **PROPOSED:** Use logical start/end spacing, alignment, borders, and positioning. Mirror directional navigation cues; do not mirror universal/non-directional icons such as search, notification, or brand marks.
- **PROPOSED:** Keep numbers, Latin automotive codes, email addresses, URLs, and identifiers isolated with appropriate bidirectional text handling so punctuation and token order remain stable.
- **PROPOSED:** Display multiple currencies clearly and localize number/date/currency presentation by locale and display context; preserve explicit currency codes where ambiguity matters. This is a visual presentation recommendation only and does not decide exchange-rate calculation, settlement rules, accounting policy, or other business logic.
- **PROPOSED:** In RTL forms, place labels and help text according to reading direction, but preserve natural direction for email, phone, URL, and part-number fields.
- **PROPOSED:** In tables, mirror the reading order while keeping numeric columns consistently aligned and totals easy to compare. Re-check chart axis order and legends in RTL.
- **PROPOSED:** Allow long translated labels to wrap or expand; avoid fixed widths that only fit Turkish or English.
- **PROPOSED:** Keep language switching discoverable and preserve the user’s organization/task context when changing locale.
- **UNKNOWN:** The Stitch samples do not show Arabic, an RTL layout, language selection, or mixed-direction data behavior.

## 17. Responsive and accessible behavior

- **OBSERVED:** HTML has responsive class variants, but only desktop screens were identified in the project metadata.
- **UNKNOWN:** Actual tablet/mobile layouts, keyboard flows, screen-reader behavior, focus states, reduced-motion handling, and measured contrast.
- **PROPOSED:** Validate desktop, tablet, and mobile screenshots for key shell, dashboard, forms, tables, dialogs, and marketplace discovery.
- **PROPOSED:** Use visible keyboard focus, semantic labels, sufficient target sizes, text alternatives for chart meaning, and non-color status cues.
- **PROPOSED:** Test light and dark themes and Turkish, English, and Arabic together; localization and theme must not break focus, contrast, or layout.
- **PROPOSED:** Provide reduced-motion behavior for transitions and charts. Avoid motion as the sole indication of a state change.

## 18. Cross-module design-language recommendations

- **PROPOSED:** Make the shared design language usable across personal workspaces, organization workspaces, platform operations, marketplace buying and selling, products and contacts, quotations, basic accounting, human resources, customer representatives, loyalty and referral programs, and future modular applications.
- **PROPOSED:** Share approved visual foundations and component grammar without requiring identical screen layouts, navigation, or workflows across modules.
- **PROPOSED:** Use role and organization context to determine access and visible tasks, not to create unrelated design systems for administrators, employees, buyers, sellers, or representatives.
- **UNKNOWN:** The inspected project does not evidence all listed modules or user roles, nor does it establish their requirements, information architecture, permissions, or workflows. Do not infer them from Stitch screen content.

## 19. Stitch-to-production design workflow

**PROPOSED — future workflow; no step is being performed in this revision:**

1. Obtain a product-owner-approved functional brief for a specific module or workflow.
2. Identify relevant existing Stitch experiments as visual references only.
3. Create original light-theme Stitch designs for the approved requirements.
4. Review those designs and obtain product-owner approval.
5. Develop corresponding dark-theme designs.
6. Validate Turkish, English, and Modern Standard Arabic, including full RTL.
7. Validate responsive layouts and interaction states.
8. Approve the designs as production-ready.
9. Only then hand the approved designs to implementation agents.

No Stitch project, screen, or design system was modified in this discovery.

## 20. Confirmed observations

- A private Stitch project named `DogruAdres` exists, ID `7913908371982548216`.
- Its theme metadata is light, Inter, `#137fec`, and `ROUND_EIGHT`.
- It includes accounting dashboard, customer form, marketing landing, and split-screen sign-in screen records.
- The inspected dashboard image shows a light neutral surface system, financial cards, a chart, notification content, and an activity table.
- The inspected sign-in image uses a blue automotive brand panel beside a white form.
- The inspected landing-page image uses a mostly light page and a distinct dark section.
- Retrieved HTML includes another blue (`#0071e3`/`#0077ed`) and several neutral text/border variants.
- No project-specific design-system asset was returned by the Stitch design-system listing.
- No existing DoğruAdres dark-theme or RTL screen was found in the inspected set.

## 21. Unapproved recommendations

The following are proposed design-system recommendations only and require product-owner approval before becoming binding. Approval of the overall visual atmosphere alone does not approve specific screen designs, styles, or interactions:

- Select one light-theme blue and resolve the observed blue variants.
- Approve semantic light and dark token sets, including status and chart palettes.
- Decide whether Inter remains the Latin font and select/validate an Arabic-capable typeface.
- Approve shared shell structure, application launcher, organization switcher, and role-aware navigation behavior.
- Approve dark-theme direction and the proposed palette.
- Approve mobile/tablet navigation and dense-table behavior.
- Approve component interaction states and accessibility acceptance criteria.
- Approve common cross-module patterns and how much visual variation marketing/authentication surfaces may retain.
- Approve each future requirement-specific screen design as production-ready before implementation.

## 22. Conflicts, risks, and unanswered questions

- **OBSERVED CONFLICT:** The project theme declares `#137fec`, while retrieved customer-related HTML contains `#0071e3` and `#0077ed`. These may be distinct iterations; the evidence does not establish which should be canonical.
- **OBSERVED ARTIFACT MISMATCH:** Some screens labeled “Muhasebe Kontrol Paneli” in Stitch have associated HTML whose page title is an invoice-entry screen. Treat those specific HTML exports as unreliable for their labeled dashboard content until the screen/HTML pairing is confirmed.
- **OBSERVED VARIATION:** Text and border colors differ between retrieved HTML exports (`#1d1d1f` vs `#101922`; `#d1d5db` vs `#d2d2d7`). They should not be silently consolidated as if one token set were already approved.
- **UNKNOWN:** No full reusable design system asset was returned; the project theme is metadata, not proof that every screen follows a single formal token library.
- **UNKNOWN:** Interactive states, mobile and tablet behavior, Arabic/RTL rendering, accessibility conformance, and dark-theme design are not established by the available screen set.
- **PRODUCT-OWNER QUESTION:** Which dashboard iteration and blue treatment should be the reference for future shared application modules?
- **PRODUCT-OWNER QUESTION:** Should marketing and sign-in surfaces retain distinct compositions while sharing the same semantic colors and typography?
- **PRODUCT-OWNER QUESTION:** Which Arabic typeface and script-specific typographic treatment best fit the product identity?
- **PRODUCT-OWNER QUESTION:** Which functional brief, workflow, role permissions, and organization context should define each future screen before it is designed in Stitch?
