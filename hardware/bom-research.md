# BOM sourcing research — ArcadeBench bartop

Researched 2026-08-18 with the research-bot pipeline (Kagi search + fetched vendor
pages). Companion to `docs/HARDWARE-BOM.md` — each BOM line gets 1–3 concrete,
orderable options. Prices are USD, as listed on the linked page at research time.

**Headline corrections to BOM assumptions:**

1. **ODROID H4+ is not the N305 board.** The H4+ ships with the Intel N97; the
   N305 model is the **H4 Ultra** ($220). Both are currently **out of stock** at
   Hardkernel, which now points buyers to the ODROID-H5.
2. **The EJ080NA-04C is a TN panel, 250 nits** — it fails the BOM's "IPS, 400+
   nit" priority. Real HDMI-native 8" 1024×768 IPS modules (Pimoroni kit and the
   AliExpress kits cloned around the same panel) measure **174×136×3 mm**, not
   the 183×141×6 mm EJ080NA-04C outline. CAD should target the 174×136 class.
3. **PAM8610 boards max out at 16.5 V** (12 V recommended) — they cannot hang
   directly off the 19 V rail; budget a 19→12 V buck for audio.
4. **No 2 mm JLF shaft extension is needed for a ~3 mm deck.** The stock JLF
   shaft is sized for thin Japanese metal panels (community consensus: fine to
   ~4 mm). Extensions exist but are +15 mm parts aimed at 3/4" MDF.

---

## 1. Compute

### ODROID H4+ / H4 Ultra — Hardkernel

- **ODROID-H4 PLUS** — $159.00 — <https://www.hardkernel.com/shop/odroid-h4-plus/>
  Intel N97 (4-core Alder Lake-N), **currently out of stock**; page explicitly
  offers the ODROID-H5 as the alternative.
- **ODROID-H4 ULTRA** — $220 — <https://www.hardkernel.com/shop/odroid-h4-ultra/>
  This is the **Core i3-N305 (8-core)** model; also out of stock at research time.
- DC input: **DC 11–20 V** via onboard barrel jack (5.5 mm outer / **2.1 mm**
  inner), per the Hardkernel shop spec block. A 19 V brick feeds the board
  directly — no buck needed. Note the H4 jack pin is 2.1 mm, not 2.5 mm.
- Older press pricing ($99/$139/$220) confirms the $220 Ultra figure; the H4+
  shop page currently shows $159.

### LattePanda Mu — LattePanda / DFRobot

- **LattePanda Mu (N100, 8 GB LPDDR5, 64 GB eMMC)** — $139 (module only) —
  <https://www.lattepanda.com/lattepanda-mu> (launch early-bird was $99).
- **LattePanda Mu (N305, 16 GB, 64 GB eMMC)** — $299 at DFRobot —
  <https://www.dfrobot.com/product-2902.html>; Mu Kit (module + Lite carrier +
  cooler) — $218 — <https://www.dfrobot.com/kit-004.html>.
- Power: module VIN **9–20 V** (docs.lattepanda.com Mu power-supply design
  guide); the DFR1142 Lite Carrier's DC 5.5×2.5 mm jack accepts **12–20 V**.
  19 V direct works. Caveat: eDP displays hang off the input rail, so if a
  custom carrier uses Mu's eDP, the display caps max input voltage — irrelevant
  here since we're using HDMI.
- It's a compute module: you must budget a carrier (Lite carrier ~$40–60) —
  total cost approaches the H4 Ultra.

### LattePanda Sigma — LattePanda

- **LattePanda Sigma (16 GB, no SSD/WiFi, DFR1080)** — from $579 —
  <https://www.lattepanda.com/lattepanda-sigma> ($648 with 500 GB SSD + WiFi 6E
  per Liliputing: <https://liliputing.com/lattepanda-sigma-is-a-hacker-friendly-single-board-pc-with-intel-core-i3-1340p/>).
- Power: DC jack **12–20 V**, 19 V / 4.74 A / 90 W adapter included in the box;
  USB-C PD 20 V also supported —
  <https://docs.lattepanda.com/content/sigma_edition/Specification/>. One
  inconsistency: the spec page's I/O section says 5.5×2.5 mm while the power
  section says 5.5×2.1 mm — measure on arrival.
- i5-1340P is overkill for emulation and blows the BOM's $150–250 compute
  budget; keep as reference only.

**Enclosure answer:** 19 V direct works for all three candidates (H4 family
11–20 V, Mu 9–20 V module / 12–20 V carrier, Sigma 12–20 V).

## 2. Display

### Pimoroni HDMI 8" IPS LCD Screen Kit (1024×768) — the default pick

- $87.95 at PiShop.us — <https://www.pishop.us/product/hdmi-8-ips-lcd-screen-kit-1024x768/>
- $99.95 at Adafruit but **"No longer stocked"** there — <https://www.adafruit.com/product/4338>
- Also sold direct by Pimoroni (PIM372) — <https://shop.pimoroni.com/en-us/products/hdmi-8-lcd-screen-kit-1024x768>
- Specs (from PiShop/Adafruit listings): IPS, 1024×768, 60 Hz, **350 cd/m²**,
  500:1, 170° viewing; **panel outer 174×136×3 mm**, screen area 165×124 mm,
  125 g; Pimoroni HDMI→LVDS driver board 65×56.5×8.5 mm + keypad; **5 V, ≥780 mA
  via micro-USB**. Native HDMI in — exactly the BOM requirement, except 350 not
  400+ nits.

### AliExpress generic 8" IPS HDMI kits — same panel class, cheaper

- "8 Inch 1024*768 IPS LCD Screen Display And Driver Control Board" — <https://www.aliexpress.com/item/1005004162403387.html> —
  listing states **174×136×3 mm screen**, 52×46×5.5 mm mini-HDMI board, 5 V
  micro-USB power; compatible with LattePanda/RPi.
- "8 Inch IPS TFT LCD Monitor Screen 1024x768 High Brightness" — ~$51–77 —
  <https://www.aliexpress.com/item/4000109665068.html> — claims 350 cd/m².
- Expect $45–80 depending on seller/options; quality control varies.

### EJ080NA-04C route (BOM's assumption) — correct the record

- Panelook confirms the BOM's outline: **183×141 mm**, active 162.0×121.5 mm —
  **but it's a TN panel, 250 cd/m², 700:1** —
  <https://www.panelook.com/EJ080NA-04C_Innolux_8.0_LCM_parameter_12715.html>.
  It is also LVDS-native, not HDMI: needs a driver board such as the
  VS-TY2660H-V1 HDMI/DVI/VGA board ($24.49, board 125×58×17 mm) —
  <https://www.ebay.com/itm/201345794861>.
- Recommendation: drop the EJ080NA-04C assumption; the Pimoroni/AliExpress IPS
  modules (174×136×3 mm, 350 nit, HDMI-native) are the real buyable class.
  Nothing found in 8" 4:3 1024×768 that genuinely hits 400+ nits in a retail
  HDMI kit — 350 nits is the realistic ceiling at this size/price.

## 3. Controls

### Buttons

- **Sanwa OBSF-30** — $3.25/ea at Paradise Arcade Shop —
  <https://paradisearcadeshop.com/collections/sanwa-obsf-series>; same $3.25 at
  Focus Attack — <https://focusattack.com/sanwa-obsf-30mm-pushbuttons-black/>.
- **Sanwa OBSF-24** — $2.40–2.75/ea at Paradise Arcade (color-dependent) —
  e.g. <https://paradisearcadeshop.com/products/sanwa-obsf-24-snap-in-button-blue>.
- 12× OBSF-30 + 2× OBSF-24 ≈ **$44** — inside the BOM's $45–70.
- Note: OBSF are snap-ins designed for thin metal panels (Focus Attack
  description); on a 3 mm printed deck they're near the top of their grip range
  — verify snap engagement on a test coupon, or use screw-in OBSN-30 instead.

### Joysticks

- **Sanwa JLF-TP-8YT** — $24.75 at Focus Attack —
  <https://focusattack.com/sanwa-jlf-tp-8yt-joystick-precursor-to-jlx-tp-8yt/>
  (~$26.99 on eBay). Focus Attack now labels it "Precursor to JLX-TP-8YT" — the
  JLX is the successor; JLF stock remains widely available for now, but for a
  productized build consider standardizing on JLX. 2× ≈ $50, matches BOM.
- **Shaft / panel thickness:** stock JLF shaft is 68 mm base-to-thread and is
  designed for the thin metal panels of Japanese cabs (community consensus:
  fine up to ~4 mm — <https://www.reddit.com/r/cade/comments/1qag19q/>;
  mounting-depth reference <https://www.slagcoin.com/joystick/mounting_layering.html>).
  **For a ~3 mm deck, no extension is needed.** What exists is the
  **Extended Sanwa JLF Joystick Shaft, $9.95 at Focus Attack** —
  <https://focusattack.com/extended-sanwa-jlf-joystick-shaft/> — +15 mm, aimed
  at MDF panels up to 18 mm. There is no common "2 mm extension" product.
- Mounting plate: JLF-P1, 95×53×1.6 mm (Focus Attack support article) — put
  these dims in CAD.

## 4. Encoder

### ESP32-S3 route — feasible, but custom firmware

- **Espressif ESP32-S3-DevKitC-1-N8R8** — $15.00 at DigiKey —
  <https://www.digikey.com/en/products/detail/espressif-systems/ESP32-S3-DEVKITC-1-N8R8/15295894>
  (AliExpress S3 dev boards run $5–8).
- Feasibility: ESP32-S3 has a native USB OTG device peripheral running TinyUSB;
  ESP-IDF officially supports HID + composite devices —
  <https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/usb_device.html>.
  Working single-gamepad USB HID firmware exists (e.g.
  <https://github.com/ModderHangout/ESP32S3-Gamepad>,
  <https://github.com/Soorya-John/ESP32-HID-gamepad>).
- **Dual gamepad on one chip is not an off-the-shelf proven project.** It is
  technically reachable (composite device with two HID interfaces, or one HID
  with two report IDs), but you'd be writing and debugging the descriptors
  yourself. Treat as the "fun but risky" option, exactly as the BOM flags.

### GP2040-CE / RP2040 route — battle-tested pick

- **Raspberry Pi Pico** — $4 (Pico W $6) — <https://www.raspberrypi.com/products/raspberry-pi-pico/>;
  GP2040-CE ships precompiled Pico builds + web configurator —
  <https://gp2040-ce.info/>.
- Important per GP2040-CE FAQ: **each board enumerates as one controller** —
  for two independent gamepads, run **two Picos (~$8 total)**, still cheaper
  than one ESP32-S3 and zero firmware risk. Advanced USB override exists for
  cabinet installs with multiple boards — <https://gp2040-ce.info/faq/faq-general>.

## 5. Audio

- **PAM8610 2×15 W class-D boards**: HiLetgo 3-pack —
  <https://www.amazon.com/HiLetgo-PAM8610-Digital-Amplifier-Channel/dp/B00WSN9S4Q>;
  singles ~$6–9 on Amazon; ~$2–4 on AliExpress. Board 30×25 mm.
  **Voltage caveat: max 16.5 V, 12 V / 3 A recommended** — do NOT feed from the
  19 V rail; needs the 19→12 V buck (which the BOM already lists as optional —
  make it mandatory if PAM8610 is used). Output 15 W×2 into 4 Ω.
- **Dayton Audio DMA58-4** 2" full-range, 4 Ω — $13.98 at Parts Express —
  <https://www.parts-express.com/Dayton-Audio-DMA58-4-2-Dual-Magnet-Aluminum-Cone-Full-Range-Driver-4-Ohm-295-582>.
  Baffle cutout 1.96" (49.8 mm), depth 1.25" (31.8 mm), 4 mounting holes.
- **Dayton Audio ND64-4** 2-1/2" full-range, 4 Ω — $19.98 (clearance) —
  <https://www.parts-express.com/Dayton-Audio-ND64-4-2-1-2-Aluminum-Magnesium-Cone-Full-Range-Driver-4-Ohm-295-520>.
  Overall ⌀ 2.52" (64 mm), cutout 2.09" (53.1 mm), depth 1.54" (39.1 mm),
  15 W RMS / 30 W max — better match for the PAM8610's output; clearance status
  means buy now or lose it.
- Cheaper alternative: Dayton CE48-4 2" 4 Ω (CE series) —
  <https://www.parts-express.com/Dayton-Audio-CE48-4-2-Full-Range-8W-4-ohm-285-163>
  (price not captured; CE series is the budget line).

## 6. Power

- **19 V brick**: Mean Well GST90A19-P1M, 19 V / 4.74 A / 90 W, 5.5×2.5 mm
  plug, Level VI — **$29.50** at BravoElectro
  (<https://www.bravoelectro.com/gst90a19-p1m.html>) and DigiKey
  (<https://www.digikey.com/en/products/detail/mean-well-usa-inc/GST90A19-P1M/7703719>).
  Budget 65 W option: Facmogu 19 V 3.42 A, 5.5×2.5 mm —
  <https://www.amazon.com/Facmogu-Transformers-Converter-5-5x2-5mm-Bluetooth/dp/B0C6PZJYJ7>
  (budget-tier; confirm price/quality on listing).
- **Panel-mount DC jack (5.5×2.5)**: Switchcraft L712RAH (2.50 mm ID / 5.50 mm
  OD, panel mount) at DigiKey —
  <https://www.digikey.com/en/products/detail/switchcraft-inc/L712RAH/7219694>;
  Same Sky (ex-CUI) locking-nut panel-mount jacks mate 2.1 or 2.5 mm plugs,
  24 V / 5 A rated —
  <https://www.digikey.com/en/product-highlight/c/cui/panel-mount-dc-power-jacks>.
  (Tensility 54-00063 is the 2.1 mm sibling — wrong pin for a 19 V 2.5 mm
  brick; don't order by analogy.) If the compute pick is the ODROID H4, the
  board-side jack is 2.1 mm — either order a 2.1 mm panel jack + matching brick
  plug, or a pigtail adapter.
- **Power switch**: Bulgin MPI002 series stainless vandal-resistant, LED ring,
  IP66, latching or momentary, **19 mm panel cutout** —
  <https://www.bulgin.com/us/products/stainless-steel-vandal-resistant-illuminated-ip66-push-button-switch-mpi002-series-12v-blue-led-ring-2-8mm-tab-termination.html>
  (sold via DigiKey; the premium "signature" option). Budget: APIELE 16 mm
  latching ring-LED switch, **16 mm (0.63") mounting hole**, ~$10 with wire
  socket —
  <https://www.amazon.com/API-ELE-GQ16-1NO1NC-Ring-Switch/dp/B079FND44N>;
  DMWD 16 mm latching IP65 multi-packs —
  <https://www.amazon.com/DMWD-Metal-Button-Switch-Waterproof/dp/B0DT8RGMMR>.
  Rule for CAD: 16 mm switch → 16 mm hole; 19 mm switch → 19 mm hole; Bulgin
  MPI002 bezel is 22 mm.

## 7. Chassis sundries

- **M3 heat-set inserts (CAD parameters):** the de-facto standard insert
  (ruthex RX-M3x5.7 / CNC Kitchen "M3 standard") is **M3 thread × 5.7 mm
  length × 4.6 mm outer diameter**; design the printed hole at **4.0–4.2 mm**
  (CNC Kitchen's tested range is 4.0–4.4 mm; 4.0 mm for ruthex —
  <https://www.cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts>,
  <https://www.cnckitchen.com/blog/threaded-inserts-for-3d-prints-cheap-vs-expensive>).
  Same numbers are sold by Prusa as "Heat Set Inserts M3 standard, 100 pcs" —
  <https://www.prusa3d.com/product/heat-set-inserts-m3-standard-100-pcs/>.
- **Buying:** ruthex M3 100 pcs (RX-M3x5.7, 4.6 mm OD) on Amazon —
  <https://www.amazon.com/stores/ruthex/page/59A519BF-8EDD-479D-8968-5A2149CD8DE0>;
  ruthex M2+M3+M4+M5 assortment (270 pcs) for full coverage —
  <https://www.amazon.com/m3-heat-set-inserts/s?k=m3+heat+set+inserts>;
  budget INCLY 130 pc M3 kit with soldering tip —
  <https://www.amazon.com/INCLY-Threaded-Insert-Set/dp/B0GXV9XTXC>.
  Amazon assortment kits run ~$10–20, matching the BOM's $20.
  (Exact Amazon prices are dynamic and weren't captured in snippets; both
  brands are mainstream and perpetually listed.)

## Items not researched (commodity, BOM estimates are fine)

RAM/NVMe/heatsink (buy with the board), RTC battery, polycarbonate cover glass,
HDMI cables, wiring/QD/JST, gaskets, feet, USB-C passthrough, badge.
