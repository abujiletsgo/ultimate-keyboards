# Windows screens QA (KE-86, 2026-11-15)

Rendered with `?os=windows` (and `?os=mac` for regressions) from a production build, headless at the app's minimum window (800x600) and at 1280x800. The app is dark-only on both platforms, so there is one theme to check. Phone and tablet sizes don't apply: the desktop window can't go below 800x600 (`tauri.conf.json`).

Found and fixed here:
- Sidebar used the Mac ⌘ icon for "Laptop keys" on Windows: now a keyboard icon.
- Ready-made sets, template mini keyboards and Keymap hold labels clipped or ran together ("AltShiftWin", "Shif", "HOLD CTF"): Windows words are wider than Mac glyphs. Labels now shrink by character count inside their key (container units on a child span); one glyph keeps its Mac size. The Keymap tab drops "hold" on Windows (the mod-tap colour says it). Measured: 0 template labels wider than their key at 800x600.
- Mac screens checked unchanged.

Left for follow-ups:
- KE-87: template wording and intent on Windows ("Command", "Right Option", "for Mac habits"; shortcuts there use Ctrl, not Win).
- Light theme: none on either platform (existing design, not a Windows gap).
- The Remapping tab's Windows setup copy only renders in the desktop app; check it on the ZenBook (KE-77).

Files: `<tab>-<size>-<os>.png`.
