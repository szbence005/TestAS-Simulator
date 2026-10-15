# TestAS Simulator

Böngészőben futó gyakorló- és vizsgaszimulátor a **digitális TestAS Kernmodul** mindhárom feladattípusához:

- **Figurale Sequenzen** – 4×4-es mátrixok sorozata; az 5. és 6. mátrixot kell kiválasztani 3–3 válaszlehetőségből (mozgás, forgatás, színváltás szabályai; lepattanás, külső gyűrű, 2×2-es blokk, x+1 lépés)
- **Mathematische Gleichungen** – egyenletrendszerek, minden betű értéke 1–20, pontosan egy megoldással
- **Lateinische Quadrate** – 5×5-ös latin négyzet (A–E), a `?` mezőbe kerülő betűt kell kitalálni

A feladatokat a program **maga generálja** (három nehézségi szinten: niedrig / mittel / hoch), így gyakorlatilag végtelen sok különböző feladat van. Nincs szerver, nincs build, nincs függőség – tiszta HTML + JavaScript.

> Inoffizielles Übungsprojekt, nincs kapcsolatban a g.a.s.t.-tal / a TestDaF-Institut-tal. Az eredeti feladatokat nem tartalmazza, csak a feladattípusok formátumát követi.

## Felület

Egyszerű, lapos kinézet: nincs színátmenet, nincs nagy címsor, világos és (`prefers-color-scheme: dark` esetén) sötét téma. A kezdőlapon a Prüfung és az Üben egymás mellett van, alatta a három feladattípus és az eredmények listája. A színek a `style.css` elején lévő CSS-változókkal (`--accent`, `--bg`, …) átírhatók. A vizsga alatt a navigáció, a bejelentkezés és a lábléc el van rejtve. Az „inoffiziell” jelzés csak a láblécben szerepel.

## Módok

| Mód | Leírás |
|---|---|
| **Prüfungsmodus** | Mint a vizsgán: típusonként 20 feladat, 25 perc, visszajelzés csak a végén. Választható: mind a három subtest egymás után, vagy csak az egyik. Lejáró időzítő, automatikus beadás, feladat-navigáció, megjelölés, billentyűparancsok. |
| **Übungsmodus** | Végtelen sok feladat, azonnali visszajelzés és megoldás, időkorlát nélkül; nehézség választható. |

A vizsgamód végén eredmény nehézségi szintenkénti bontásban, feladatonkénti átnézés a megoldással. Az eredmények a böngésző `localStorage`-ában maradnak. A vizsgához tartozó **seed** megjelenik az eredménynél; ugyanazzal a seeddel ugyanaz a feladatsor jön újra.

Billentyűk vizsgamódban: `←` `→` lapozás, latin négyzetnél `A`–`E`, figurális sorozatnál `1`–`3` (Bild 1) és `4`–`6` (Bild 2) a válasz kiválasztása, egyenletnél `Enter` = következő.

## Futtatás helyben

```bash
npm install            # egyszer: better-auth + better-sqlite3
npm start              # http://localhost:8080 – statikus fájlok + bejelentkezés + eredmények szinkronizálása
npm run start:static   # csak statikus szerver, függőségek és fiókok nélkül
npm test               # generátor-tesztek (Node 20+)
```

(Az `index.html` ES-modulokat tölt, ezért `file://`-ról megnyitva nem működik.)

## Fiókok (Better Auth)

A bejelentkezés [Better Auth](https://www.better-auth.com)-ra épül (e-mail + jelszó, SQLite adatbázis a `data/` mappában). Fiókkal az eredmények a szerveren is tárolódnak, így több eszközön ugyanaz az előzmény látszik; bejelentkezéskor a helyi és a szerveroldali lista összefésülődik, kijelentkezéskor a helyi másolat törlődik.

- `server/auth.js` – Better Auth beállítás + `history` tábla
- `server/index.js` – statikus fájlok, `/api/auth/*`, `/api/history`
- `src/auth.js` – kliens (sima `fetch`, nincs build)

Környezeti változók: `BETTER_AUTH_SECRET` (éles üzemben kötelező, hosszú véletlen szöveg), `BETTER_AUTH_URL` (a nyilvános URL), `DB_PATH`, `PORT`. A Better Auth táblái induláskor automatikusan létrejönnek; ha ez nem sikerülne: `npm run auth:migrate` (= `npx auth@latest migrate --config server/auth.js -y`), majd indítsd újra a szervert.

Ha az oldal **statikus hosztról** fut (pl. GitHub Pages), nincs auth szerver: a „Anmelden” gomb ilyenkor nem jelenik meg, és minden a böngésző `localStorage`-ában marad, mint korábban. Fiókokhoz Node-ot futtató hoszt kell (Render, Railway, Fly.io, saját VPS…).

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
src/auth.js                     bejelentkezés + előzmény-szinkron kliens
server/                         Better Auth szerver (opcionális)
src/rng.js                      seedelhető véletlenszám-generátor
src/equations.js                egyenletrendszer-generátor (egyértelműséget ellenőrzi)
src/latin.js                    latin négyzet generátor + következtetési-lépés számláló
src/figural.js                  figurális sorozat generátor (szabályok, egyértelműség-ellenőrzés, rossz válaszok)
src/tasks.js                    vizsgasor-összeállítás (6 niedrig / 7 mittel / 7 hoch)
test/                           node:test tesztek
```

### Hogyan garantált a jó feladat?

- **Figurale Sequenzen:** a generátor a 4 látható mátrixból minden lehetséges szabályt (mozgás: sor/oszlop/átló lepattanással, külső gyűrű, 2×2-es blokk, x+1 lépés; forgatás; színciklus) végigpróbál, és csak akkor fogad el egy feladatot, ha az összes illeszkedő szabály ugyanazt jósolja az 5. és 6. mátrixra. A rossz válaszok a helyes mátrix 1–2 figurájának „hihető” elrontásai (másik lépés az útvonalon, rossz elforgatás, rossz szín); a figurák soha nem fedik egymást. A megoldásnál a szabályok németül is magyarázva jelennek meg.
- **Gleichungen:** a generátor addig választ egyenleteket a rejtett megoldáshoz, amíg az 1–20 tartományban csak egyetlen értékkombináció marad; a tesztek ezt kimerítő kereséssel ellenőrzik.
- **Quadrate:** a rács úgy készül, hogy a `?` mező kizárólag „egyetlen lehetséges betű / egyetlen lehetséges hely” következtetésekkel megkapható legyen. A nehézség a szükséges következtetési körök száma (niedrig = 1, mittel = 2, hoch ≥ 3) és a kitöltött mezők száma.

## Ötletek a folytatáshoz

- Fachmodul-szerű olvasás/értelmezés feladatok
- Hibás válaszok újragyakorlása, statisztika a nehézség szerint

## Licenc

MIT
