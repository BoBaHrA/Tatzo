from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)


calendar_path = Path("mobile/app/(tabs)/calendar.tsx")
calendar = calendar_path.read_text(encoding="utf-8")
calendar = replace_once(
    calendar,
    "  navigationControls: { display: 'none' },",
    "  navigationControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },",
    "calendar navigation controls",
)
calendar = replace_once(
    calendar,
    "  navButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: '#071820' },",
    "  navButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.16)', backgroundColor: 'rgba(7,28,38,.86)' },",
    "calendar nav button style",
)
calendar = replace_once(
    calendar,
    "  todayButton: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: '#071820' },",
    "  todayButton: { flex: 1, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.16)', backgroundColor: 'rgba(7,28,38,.86)' },",
    "calendar today button style",
)
calendar = replace_once(
    calendar,
    "  monthTitle: { display: 'none' },",
    "  monthTitle: { color: colors.text, fontFamily: 'serif', fontSize: 21, lineHeight: 26, fontWeight: '700', textAlign: 'center', textTransform: 'capitalize', marginTop: 2 },",
    "calendar month title",
)
calendar = replace_once(
    calendar,
    "  viewToggle: { display: 'none' },",
    "  viewToggle: { minHeight: 44, flexDirection: 'row', gap: 7 },",
    "calendar view toggle",
)
calendar = replace_once(
    calendar,
    "  viewToggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(4,197,191,.12)', backgroundColor: '#071820' },",
    "  viewToggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: 'rgba(7,28,38,.82)' },",
    "calendar toggle item",
)
calendar = replace_once(
    calendar,
    "  viewToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },",
    "  viewToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: .18, shadowRadius: 9, elevation: 2 },",
    "calendar toggle active",
)
calendar_path.write_text(calendar, encoding="utf-8")


result_path = Path("mobile/src/style-match/style-match-result-v2.tsx")
result = result_path.read_text(encoding="utf-8")
result = replace_once(
    result,
    "    <View style={styles.wrap}>\n      <View style={styles.resultsHeader}>",
    "    <View style={styles.wrap}>\n      <View pointerEvents=\"none\" style={styles.resultAmbient}>\n        <View style={[styles.resultGlow, styles.resultGlowTealOuter]} />\n        <View style={[styles.resultGlow, styles.resultGlowTealCore]} />\n        <View style={[styles.resultGlow, styles.resultGlowPinkOuter]} />\n        <View style={[styles.resultGlow, styles.resultGlowPinkCore]} />\n      </View>\n      <View style={styles.resultsHeader}>",
    "result ambient layer",
)

replacements = [
    ("  wrap: { gap: 14 },", "  wrap: { position: 'relative', gap: 12, paddingBottom: 6 },", "result wrap"),
    ("  resultsHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },", "  resultsHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: 2, zIndex: 2 },", "result header"),
    ("  completeBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(4,197,191,.10)', borderWidth: 1, borderColor: 'rgba(4,197,191,.24)' },", "  completeBadge: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: 'rgba(7,28,38,.78)', borderWidth: 1, borderColor: 'rgba(141,243,236,.24)' },", "complete badge"),
    ("  completeText: { color: colors.primary, fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .7 },", "  completeText: { color: '#8df3ec', fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .85 },", "complete text"),
    ("  hero: { position: 'relative', overflow: 'hidden', backgroundColor: '#082b34', borderRadius: 24, padding: 22, gap: spacing.sm },", "  hero: { position: 'relative', overflow: 'hidden', backgroundColor: 'rgba(13,40,50,.96)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(150,230,232,.18)', padding: 18, gap: 9, zIndex: 1 },", "hero"),
    ("  heroTealGlow: { position: 'absolute', width: 220, height: 180, borderRadius: 100, right: -80, bottom: -100, backgroundColor: 'rgba(4,197,191,.18)' },", "  heroTealGlow: { position: 'absolute', width: 250, height: 190, borderRadius: 125, right: -82, bottom: -105, backgroundColor: 'rgba(9,200,194,.16)' },", "hero glow"),
    ("  eyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },", "  eyebrow: { color: '#8df3ec', fontSize: 9, fontWeight: '800', letterSpacing: 1.55, textTransform: 'uppercase' },", "eyebrow"),
    ("  confidence: { color: colors.primary, fontSize: 53, lineHeight: 57, fontWeight: '900', letterSpacing: -3 },", "  confidence: { color: '#09c8c2', fontFamily: 'serif', fontSize: 52, lineHeight: 55, fontWeight: '700', letterSpacing: -2.4 },", "confidence"),
    ("  topStyle: { color: colors.white, fontSize: 22, lineHeight: 26, fontWeight: '900' },", "  topStyle: { color: colors.white, fontFamily: 'serif', fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -.5 },", "top style"),
    ("  panel: { backgroundColor: 'rgba(7,28,38,.90)', borderWidth: 1, borderColor: 'rgba(150,230,232,.16)', borderRadius: 21, padding: 17, gap: 14 },", "  panel: { backgroundColor: 'rgba(7,28,38,.86)', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)', borderRadius: 20, padding: 16, gap: 13, zIndex: 1 },", "panel"),
    ("  panelTitle: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '900' },", "  panelTitle: { color: colors.white, fontFamily: 'serif', fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -.35 },", "panel title"),
    ("  personalityCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#c90a62', borderRadius: 24, padding: 20, gap: 8 },", "  personalityCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#d10b68', borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', padding: 18, gap: 8, zIndex: 1 },", "personality card"),
    ("  personalityShade: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -65, bottom: -85, backgroundColor: 'rgba(94,9,48,.42)' },", "  personalityShade: { position: 'absolute', width: 230, height: 190, borderRadius: 115, right: -88, bottom: -98, backgroundColor: 'rgba(86,4,47,.38)' },", "personality shade"),
    ("  personalityTitle: { color: colors.white, fontSize: 27, fontWeight: '900', letterSpacing: -.7 },", "  personalityTitle: { color: colors.white, fontFamily: 'serif', fontSize: 25, lineHeight: 29, fontWeight: '700', letterSpacing: -.65 },", "personality title"),
    ("  artistCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(150,230,232,.16)' },", "  artistCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(150,230,232,.18)', backgroundColor: 'rgba(255,255,255,.025)' },", "artist card"),
    ("  communityCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#0b2b35', borderRadius: 22, padding: 19, gap: 4 },", "  communityCard: { position: 'relative', overflow: 'hidden', backgroundColor: 'rgba(11,43,53,.94)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(150,230,232,.14)', padding: 18, gap: 5, zIndex: 1 },", "community card"),
    ("  communityNumber: { color: colors.primary, fontSize: 36, fontWeight: '900' },", "  communityNumber: { color: colors.primary, fontFamily: 'serif', fontSize: 36, lineHeight: 40, fontWeight: '700' },", "community number"),
    ("  achievement: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(150,230,232,.12)', opacity: .55 },", "  achievement: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 15, backgroundColor: 'rgba(13,39,49,.82)', borderWidth: 1, borderColor: 'rgba(150,230,232,.13)', opacity: .55 },", "achievement"),
    ("  wrappedCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#102a39', borderRadius: 23, padding: 19, gap: 8 },", "  wrappedCard: { position: 'relative', overflow: 'hidden', backgroundColor: 'rgba(16,42,57,.96)', borderRadius: 21, borderWidth: 1, borderColor: 'rgba(150,230,232,.12)', padding: 18, gap: 8, zIndex: 1 },", "wrapped card"),
    ("  wrappedTitle: { color: colors.white, fontSize: 23, fontWeight: '900' },", "  wrappedTitle: { color: colors.white, fontFamily: 'serif', fontSize: 23, lineHeight: 27, fontWeight: '700', letterSpacing: -.45 },", "wrapped title"),
]
for old, new, label in replacements:
    result = replace_once(result, old, new, label)

marker = "  resultsHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: 2, zIndex: 2 },"
ambient_styles = """  resultAmbient: { position: 'absolute', top: -90, left: -80, right: -80, bottom: -100, overflow: 'hidden' },
  resultGlow: { position: 'absolute', borderRadius: 999 },
  resultGlowTealOuter: { width: 380, height: 320, top: -160, left: -175, backgroundColor: 'rgba(9,200,194,.025)' },
  resultGlowTealCore: { width: 240, height: 210, top: -105, left: -110, backgroundColor: 'rgba(9,200,194,.055)' },
  resultGlowPinkOuter: { width: 410, height: 350, right: -205, bottom: -165, backgroundColor: 'rgba(237,11,112,.022)' },
  resultGlowPinkCore: { width: 255, height: 220, right: -120, bottom: -105, backgroundColor: 'rgba(237,11,112,.052)' },
"""
result = replace_once(result, marker, ambient_styles + marker, "result ambient styles")
result_path.write_text(result, encoding="utf-8")


shell_path = Path("mobile/scripts/shell-parity-check.mjs")
shell = shell_path.read_text(encoding="utf-8")
shell = replace_once(
    shell,
    "check(calendar.includes(\"navigationControls: { display: 'none' }\") && calendar.includes(\"viewToggle: { display: 'none' }\"), 'Primary mobile Calendar hides the desktop-style control stack to match the deployed web view');",
    "check(calendar.includes(\"navigationControls: { flexDirection: 'row'\") && calendar.includes(\"viewToggle: { minHeight: 44\") && calendar.includes(\"monthTitle: { color: colors.text\"), 'Calendar exposes compact month navigation plus Month / Week / Day controls');",
    "calendar parity guard",
)
shell_path.write_text(shell, encoding="utf-8")


style_check_path = Path("mobile/scripts/style-match-parity-check.mjs")
style_check = style_check_path.read_text(encoding="utf-8")
style_check = replace_once(
    style_check,
    "check(result.includes('matchLockup') && result.includes('confidence'), 'Results lead with the web match-confidence lockup');",
    "check(result.includes('matchLockup') && result.includes('confidence'), 'Results lead with the web match-confidence lockup');\ncheck(result.includes('resultAmbient') && result.includes('resultGlowTealOuter') && result.includes('resultGlowPinkOuter'), 'Results carry the same diffuse teal/pink ambient atmosphere as the website');\ncheck(result.includes(\"panelTitle: { color: colors.white, fontFamily: 'serif'\") && result.includes(\"topStyle: { color: colors.white, fontFamily: 'serif'\") && result.includes(\"wrappedTitle: { color: colors.white, fontFamily: 'serif'\"), 'Result hierarchy uses the web serif display treatment');",
    "style result parity guards",
)
style_check_path.write_text(style_check, encoding="utf-8")
