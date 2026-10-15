# TestAS Simulator (inoffiziell)

Böngészőben futó gyakorló- és vizsgaszimulátor a **digitális TestAS Kernmodul** két feladattípusához:

- **Mathematische Gleichungen** – egyenletrendszerek, minden betű értéke 1–20, pontosan egy megoldással
- **Lateinische Quadrate** – 5×5-ös latin négyzet (A–E), a `?` mezőbe kerülő betűt kell kitalálni

A feladatokat a program **maga generálja** (három nehézségi szinten: niedrig / mittel / hoch), így gyakorlatilag végtelen sok különböző feladat van. Nincs szerver, nincs build, nincs függőség – tiszta HTML + JavaScript.

> Inoffizielles Übungsprojekt, nincs kapcsolatban a g.a.s.t.-tal / a TestDaF-Institut-tal. Az eredeti feladatokat nem tartalmazza, csak a feladattípusok formátumát követi.

## Módok

| Mód | Leírás |
|---|---|
| **Prüfungsmodus** | Mint a vizsgán: típusonként 20 feladat, 25 perc, visszajelzés csak a végén. Választható: mindkét subtest egymás után, vagy csak az egyik. Lejáró időzítő, automatikus beadás, feladat-navigáció, megjelölés, billentyűparancsok. |
| **Übungsmodus** | Végtelen sok feladat, azonnali visszajelzés és megoldás, időkorlát nélkül; nehézség választható. |

A vizsgamód végén eredmény nehézségi szintenkénti bontásban, feladatonkénti átnézés a megoldással. Az eredmények a böngésző `localStorage`-ában maradnak. A vizsgához tartozó **seed** megjelenik az eredménynél; ugyanazzal a seeddel ugyanaz a feladatsor jön újra.

Billentyűk vizsgamódban: `←` `→` lapozás, latin négyzetnél `A`–`E` a válasz kiválasztása, egyenletnél `Enter` = következő.

## Futtatás helyben

```bash
npm start        # http://localhost:8080
npm test         # generátor-tesztek (Node 20+)
```

Más nem kell hozzá. (Az `index.html` ES-modulokat tölt, ezért `file://`-ról megnyitva nem működik – használd az `npm start`-ot, vagy a GitHub Pages-t.)

## Telepítés GitHub Pages-re

1. Hozz létre egy GitHub repót, és told fel ide a projektet (`git remote add origin …` majd `git push -u origin main`).
2. A repóban: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Minden `main`-re pusholt változásnál lefutnak a tesztek, és ha zöldek, a `.github/workflows/pages.yml` kitelepíti az oldalt a `https://<felhasználó>.github.io/<repo>/` címre.

## Safe Exam Browser (SEB)

A szimuláció SEB-ből is használható, hogy a vizsga környezetét is gyakorold:

1. Telepítsd a Safe Exam Browsert és a **SEB Configuration Tool**-t (https://safeexambrowser.org).
2. A konfigurációban a **Start URL** legyen a GitHub Pages címed (vagy `http://localhost:8080`, ha helyben futtatod).
3. A konfigurációban állítsd be a számodra megfelelő korlátozásokat (kilépés jelszava, tiltott billentyűk, URL-szűrő stb.), és mentsd `.seb` fájlként; a fájl megnyitásával indul a szimuláció.
4. Ha az oldal SEB-ben fut, a főoldalon megjelenik a „Safe Exam Browser erkannt” jelvény.

A böngésző nem tud jegyzetelést megakadályozni – a „nincs jegyzet” szabályt magadnak kell betartani (a szimulátor a vizsgához hasonlóan nem biztosít jegyzetelési lehetőséget).

## Felépítés

```
index.html, style.css, app.js   felület (képernyők, időzítő, értékelés)
src/rng.js                      seedelhető véletlenszám-generátor
src/equations.js                egyenletrendszer-generátor (egyértelműséget ellenőrzi)
src/latin.js                    latin négyzet generátor + következtetési-lépés számláló
src/tasks.js                    vizsgasor-összeállítás (6 niedrig / 7 mittel / 7 hoch)
test/                           node:test tesztek
```

### Hogyan garantált a jó feladat?

- **Gleichungen:** a generátor addig választ egyenleteket a rejtett megoldáshoz, amíg az 1–20 tartományban csak egyetlen értékkombináció marad; a tesztek ezt kimerítő kereséssel ellenőrzik.
- **Quadrate:** a rács úgy készül, hogy a `?` mező kizárólag „egyetlen lehetséges betű / egyetlen lehetséges hely” következtetésekkel megkapható legyen. A nehézség a szükséges következtetési körök száma (niedrig = 1, mittel = 2, hoch ≥ 3) és a kitöltött mezők száma.

## Ötletek a folytatáshoz

- **Figurale Sequenzen** (a harmadik Kernmodul-típus; SVG-alapú mátrixsorozatok)
- Fachmodul-szerű olvasás/értelmezés feladatok
- Hibás válaszok újragyakorlása, statisztika a nehézség szerint

## Licenc

MIT
