# Ukrštene Reči — Product Requirements Document (PRD)

**Verzija:** 1.0
**Datum:** 2026-06-25
**Status:** Spreman za development (v1 / MVP)
**Platforme:** iOS + Android (React Native / Expo)

---

## 1. Pregled proizvoda

**Ukrštene Reči** je mobilna igra iz domena enigmatike za iOS i Android, građena u React Native (Expo). Igra koristi **skandinavka** format ukrštenice (asocijacije unutar kvadratića sa strelicama) i nudi dva moda igre koji dele istu tablu:

- **Basic mod** — klasična skandinavka: korisnik popunjava tablu rešavajući reči po asocijacijama (tekst ili slika) iz kvadratića sa strelicama.
- **Advanced mod** — ista tabla i asocijacije, ali korisnik ne kuca slobodno: dobija 5 slova u dnu ekrana koja raspoređuje ćeliju po ćeliju. Submit po iteraciji; tačna slova ostaju zaključana, za pogrešna i prazna mesta stiže novih do 5 slova.

Vizuelni i UX cilj: replicirati "smooth" osećaj igre [Crossword Challenge](https://apps.apple.com/rs/app/crossword-challenge/id6741474981), uz prepoznatljiv balkanski identitet i podršku za regionalne jezike i ličnosti.

### 1.1 Ciljevi
- Lansirati polirani MVP sa oba moda i 5 jezika.
- Izgraditi bazu korisnika; monetizaciju (reklame) uvesti kasnije.
- Arhitektura mora od starta podržavati kasnije dodavanje reklama, lives/energy sistema, leaderboard-a i dnevnog izazova bez velikog refaktora.

### 1.2 Obim v1 (MVP)
**Uključeno:**
- Basic i Advanced mod
- 5 jezika (Srpski ćir/lat, Hrvatski, Bosanski, Crnogorski, Makedonski)
- Linearna progresija nivoa po jeziku
- Skor + ocena 1–5 zvezdica
- 2 besplatna hinta po nivou (1 reč + 1 slovo)
- Opcioni nalog (Apple/Google) + anonimno igranje
- Offline igranje (keširani paketi nivoa)
- Svetla + tamna tema
- Server-side bulk generator nivoa + admin panel

**Van obima v1 (predviđeno arhitekturom, dodaje se kasnije):**
- Monetizacija / reklame
- Inventar hintova / hint valuta
- Lives / energy / game-over sistem
- Leaderboard i društvene funkcije
- Dnevni izazov
- Korisnički generisan sadržaj
- "Varljiva" slova (hard mode) u Advanced modu

---

## 2. Arhitektura sistema

Tri komponente:

### 2.1 Mobilna aplikacija (Expo / React Native)
- Rendering table, paleta slova / tastatura, interakcije i animacije.
- Lokalni keš nivoa i napretka — radi **offline**: preuzme paket neodigranih nivoa unapred, korisnik igra bez interneta dok ima keša.
- Sinhronizuje napredak i preuzima nove pakete kad ima konekciju.
- **State management:** Zustand (ili Redux Toolkit).
- **Lokalna baza:** SQLite (`expo-sqlite`) za keširane nivoe i napredak.
- **Animacije:** `react-native-reanimated` + `react-native-gesture-handler` (60fps, prevlačenje slova).
- **Haptika:** `expo-haptics`.
- **Slike:** `expo-image` (ugrađen disk keš).
- **Lokalizacija:** `i18next` + `expo-localization`.

### 2.2 Backend (Node.js + PostgreSQL)
- Hostuje se na **postojećem VPS-u**; dodaje se **nova PostgreSQL schema** (predlog naziva: `ukrstene`) u postojeću bazu.
- **Generator nivoa** — algoritam koji od rečnika/fraza/ličnosti pravi skandinavka table sa koeficijentom težine; pokreće se u **bulk-u** (pozadinski job), ne ručno po nivou.
- **REST API** (JSON, verzionisan `/v1/...`, JWT autentikacija):
  - autentikacija (Apple/Google + anonimno)
  - serviranje neodigranih nivoa po modu/jeziku/pismu
  - prijem rezultata (skor, zvezdice, greške, hintovi)
  - sync napretka
- **Admin panel** — upravljanje rečnicima i ličnostima (sa slikama), pokretanje bulk generisanja/regeneracije, pregled statistike.

### 2.3 Skladište slika
- **v1:** slike na VPS-u + **besplatan Cloudflare CDN** ispred (edge keš → VPS skoro da ne dobija pozive za slike; app dodatno kešira lokalno → svaka slika se realno povuče jednom po uređaju). Nula dodatnog troška.
- **Plan za skaliranje:** ako baza slika naraste (stotine MB+), migracija na **Cloudflare R2** (S3-kompatibilan, bez egress naknade, ~$0.015/GB mesečno).

### 2.4 Tok podataka (primer)
1. Admin učita/doda reči u rečnik → pokrene **bulk generator** → veliki broj nivoa i koeficijenata se upiše u bazu kroz ceo raspon težine.
2. App pri pokretanju traži "sledeći paket neodigranih nivoa" za izabrani jezik/pismo/mod → kešira lokalno (SQLite).
3. Korisnik igra offline → po završetku nivoa rezultat se čuva lokalno → sinhronizuje na server kad ima net.
4. Server beleži odigrane nivoe → nikad ih ponovo ne servira tom korisniku.
5. Admin po potrebi pokrene "shuffle/regeneraciju" → nove varijacije se kreiraju, stare se penzionišu (`status=retired`); postojeći korisnici to ne osećaju.

---

## 3. Model podataka

Nova PostgreSQL schema (`ukrstene`). Glavne tabele:

### `languages`
- `id`, `code` (sr, hr, bs, me, mk), `name`
- `supported_scripts` (npr. `['cyr','lat']` za Srpski; `['cyr']` za Makedonski; `['lat']` za ostale)

### `dictionaries`
- `id`, `language_id`, `word`, `script`, `frequency` (čestoća → retkost utiče na težinu), `length`
- Digrafi (Lj, Nj, Dž / Љ Њ Џ) se čuvaju i tretiraju kao **jedan logički znak**.

### `clues` (asocijacije)
- `id`, `word_id` (FK na dictionaries), `type` (`text` | `image`), `content` (tekst opisa ili referenca na sliku), `personality_id` (opciono)

### `personalities`
- `id`, `language_id`, `name`, `image_url`, `answer_word_id`
- Regionalno specifične ličnosti (sportista/glumac/poznata ličnost) — različite po jeziku.

### `levels`
- `id`, `mode` (`basic` | `advanced`), `language_id`, `script`
- `difficulty_coefficient` (1–100), `difficulty_band` (npr. 1–20 pojaseva)
- `level_number` (redni broj u progresiji)
- `variation_group` (više tabli istog rednog broja — različiti korisnici dobijaju različite varijacije sličnog koeficijenta)
- `grid_width` (6–9), `grid_height` (6–12)
- `grid_data` (JSON: dimenzije, ćelije, reči i pozicije, smerovi/strelice, pozicije i sadržaj asocijacija, rešenja)
- `status` (`active` | `retired`)

### `users`
- `id`, `auth_provider` (`apple` | `google` | `anon`), `external_id`
- preference: `current_language_id`, `current_script`, `theme`, `check_mode`

### `user_progress`
- `id`, `user_id`, `level_id`, `mode`
- `stars`, `score`, `mistakes`, `hints_used`, `completed_at`
- Koristi se da se odigrani nivoi ne ponavljaju i da se prati progresija (per-jezik).

**Ključno pravilo:** isti `grid_data` JSON format koriste oba moda — razlika je samo u načinu unosa (slobodno kucanje vs paleta od 5 slova).

---

## 4. Generisanje nivoa

### 4.1 Bulk generator (admin pokreće)
- Admin **ne** pravi nivoe ručno. Tok: doda/učita reči u rečnik → pokrene bulk generator → algoritam automatski kreira veliki broj nivoa kroz ceo raspon težine + izračuna koeficijente.
- Parametri koje admin bira: jezik, pismo, mod, broj nivoa, broj varijacija po nivou.
- Izvršava se kao **pozadinski job** (može dugo da traje).
- Dodavanje novih reči = ponovni bulk run koji proširuje pul.

### 4.2 Algoritam (logiku detaljno definiše dev tim — PRD fiksira granice i faktore)
1. Bira reči iz rečnika i slaže ih u mrežu maksimizujući ukrštanja.
2. Bira asocijacije (tekst / slika / ličnost) za svaku reč.
3. Računa `difficulty_coefficient` iz:
   - veličine table (više reči = teže),
   - dužine i retkosti reči (česte vs retke reči),
   - broja ukrštanja,
   - (Advanced) "varljivosti" slova.
4. Mapira koeficijent na `difficulty_band`, a band na `level_number`.
5. Generiše više varijacija po rednom broju nivoa (`variation_group`).

### 4.3 Dimenzije table
- Pravougaone (portrait) table dozvoljene: **širina 6–9, visina 6–12**.
- **Obavezno:** cela ukrštenica mora da stane na tipičan telefonski ekran **bez zoom-a i bez skrolovanja**. Širina je usko grlo (kvadratići moraju biti dovoljno veliki za prst), pa se širina drži uže (6–9), a visina pušta naviše (do ~12).

### 4.4 Koeficijent težine — opsezi (bands)
- Koeficijent **ne mora biti precizan**. Radi se sa **pojasevima težine**: npr. nivoi 50–60 padaju u isti pojas (~55–62).
- Nekoliko varijacija istog rednog broja deli isti pojas.

### 4.5 Regeneracija / shuffle
- Admin može da pokrene regeneraciju koja pravi nove varijacije i penzioniše stare (`status=retired`).
- Korisnici koji su odigrali stare nivoe to ne osećaju; novi korisnici dobijaju nove varijacije.

---

## 5. Gameplay — Basic mod

**Cilj:** popuniti celu skandinavka tablu tačnim rečima rešavajući asocijacije.

### 5.1 Ekran
- **Gornja traka:** nazad, broj/naziv nivoa, skor + zvezdice, podešavanja.
- **Tabla:** kvadratići sa asocijacijama (tekst ili slika) i strelicama (→ desno, ↓ dole) koje pokazuju gde i u kom smeru ide reč; prazni kvadratići za unos.
- **Dno:** tastatura sa slovima izabranog jezika/pisma (uključuje Š Đ Č Ć Ž / Ш Ђ Ч Ћ Ж; Crnogorski + Ś Ź; digrafi Lj/Nj/Dž kao **jedan taster**).

### 5.2 Interakcija
1. Tap na ćeliju/reč → bira aktivnu reč (highlight cele reči + njene asocijacije).
2. Kucanje slova; kursor se pomera kroz reč; ćelije na ukrštanju se dele između dve reči.
3. Tap na asocijaciju-sliku → uvećani prikaz slike (npr. lik sportiste).
4. Prebacivanje smera (vodoravno/uspravno) na ukrštanju: dupli tap ili dugme.

### 5.3 Provera tačnosti
Korisnik bira u podešavanjima (podrazumevano **Auto-check**):
- **Auto-check** — pogrešno slovo se odmah obeleži (crveno), računa se kao greška.
- **Bez provere** — provera tek na kraju nivoa.

Greške **smanjuju zvezdice**, ali nema game-over-a — korisnik uvek može da završi nivo.

### 5.4 Kraj nivoa
Ekran rezultata: zvezdice (1–5), skor, broj grešaka, iskorišćeni hintovi, dugme "Sledeći nivo".

---

## 6. Gameplay — Advanced mod

**Cilj:** ista skandinavka tabla i asocijacije kao Basic, ali korisnik raspoređuje slova koja sistem servira u grupama od 5.

### 6.1 Ekran
Identičan Basic-u (tabla + asocijacije + strelice), ali umesto tastature, u dnu je **paleta od 5 slova** (bež pločice) i dugme **Submit** ("Popuni" / "Potvrdi").

### 6.2 Tok iteracije
1. Sistem prikaže 5 slova u dnu.
2. Korisnik prevlači/tapka svako slovo u ćeliju za koju misli da pripada (slovo po slovo). **Može slobodno da premešta/menja slova pre Submit-a.**
3. **Submit** → sistem proverava raspoređena slova:
   - **Tačno postavljena slova** ostaju (zaključana) u tabli.
   - **Pogrešno postavljena slova** se uklanjaju i broje kao greška (smanjuju zvezdice).
4. Sistem dopunjava paletu **novim slovima do 5** (pogrešna iz prethodne iteracije se NE vraćaju; stiže potpuno novih do 5, dok se tabla ne popuni).
5. Ponavlja se dok cela tabla nije tačna.

### 6.3 Izbor slova za paletu
- Sistem bira nasumično iz preostalih nepopunjenih ćelija — slova koja stvarno fale u tabli.
- **v1:** sva slova u paleti uvek pripadaju tabli (bez varljivih slova).
- **Kasnije (hard mode):** opciono dodavanje "varljivih" slova na najtežim nivoima.

### 6.4 Animacije i UX (obavezno za "smooth" osećaj)
- **Tačno slovo:** scale-bounce "uklapanje" + zeleno bljeskanje/check → zaključavanje.
- **Pogrešno slovo:** blagi shake + crveno bljeskanje → slovo nestaje.
- **Submit:** provera sa malim staggered tajmingom (jedno po jedno, brzo).
- **Nova slova:** glatko "uleću" u paletu odozdo.
- **Kraj nivoa:** zvezdice se pune jedna po jedna.
- **Haptika:** lagani tap na tačno, jači na pogrešno.

### 6.5 Kraj nivoa
Isti ekran rezultata kao Basic.

---

## 7. Skor, zvezdice i hintovi (oba moda)

### 7.1 Skor i zvezdice
Funkcija (greške + iskorišćeni hintovi):
- "Savršen" rezultat = **5★** (bez grešaka, bez hintova)
- **4★** — minimalne greške / 1 hint
- **3★** — umerene greške
- **2★** — dosta grešaka
- **1★** — nivo završen, ali sa puno grešaka

Tačni pragovi (koliko grešaka = koliko zvezdica) se **kalibrišu prema težini nivoa** — na težem nivou više grešaka se "prašta".

### 7.2 Hintovi (v1)
- **2 po nivou:** 1 hint za **celu reč** + 1 hint za **slovo**.
- **Hint za reč** — otkriva celu aktivnu reč.
- **Hint za slovo** — otkriva/zaključava jedno tačno slovo u trenutnoj ćeliji.
- Resetuju se na svakom nivou, ne gomilaju se, ne kupuju se (v1).
- Svaki iskorišćen hint smanjuje konačnu ocenu.
- **Arhitektura:** model hintova izolovan tako da se kasnije lako prelazi na "inventar + reklama/kupovina" bez refaktora gameplay-a.

---

## 8. Jezici, pisma i lokalizacija

| Jezik | Pismo | Specifičnosti |
|---|---|---|
| Srpski | Ćirilica **ili** latinica (korisnik bira) | Š Đ Č Ć Ž / Ш Ђ Ч Ћ Ж; digrafi Lj Nj Dž |
| Hrvatski | Latinica | Š Đ Č Ć Ž; digrafi Lj Nj Dž |
| Bosanski | Latinica | Š Đ Č Ć Ž; digrafi Lj Nj Dž |
| Crnogorski | Latinica | + Ś Ź; digrafi Lj Nj Dž |
| Makedonski | Ćirilica | Љ Њ Џ Ѕ Ѓ Ќ Ж Ч Ш |

### 8.1 Ključne odluke
- **Digrafi (Lj, Nj, Dž / Љ Њ Џ) = jedan kvadratić** = jedan taster / jedna pločica.
- Rečnici, asocijacije i ličnosti su **odvojeni po jeziku** (Hrvatski ≠ Srpski rečnik; ličnosti regionalno različite). Generator nikad ne meša jezike.
- **Srpsko pismo:** isti rečnik se čuva u oba pisma (transliteracija ćir↔lat je deterministička); korisnik bira prikaz. Ostali jezici imaju fiksno pismo.
- **UI lokalizacija:** ceo interfejs preveden na svih 5 jezika; izbor jezika igre = izbor jezika aplikacije.
- **Izbor jezika:** na prvom pokretanju korisnik bira zemlju/jezik na početnom ekranu; to ostaje podrazumevano dok ne promeni u podešavanjima (settings toggle).
- **Progresija je odvojena po jeziku:** promena jezika = povratak na **Nivo 1** za taj jezik.

---

## 9. Nalozi i sinhronizacija

- **Opcioni nalog.** Korisnik igra odmah anonimno (anonimni ID uređaja); napredak se čuva lokalno + tiho sinhronizuje.
- **Login (Apple / Google)** se nudi kao benefit: trajno čuvanje i sync napretka preko više uređaja.
- Pri loginu se anonimni napredak migrira na nalog.

---

## 10. Vizuelni dizajn

### 10.1 Osnovna tema — "Topla enigmatika" (svetla)
| Element | Boja |
|---|---|
| Pozadina | `#FAF7F2` (topla off-white, "papir") |
| Primarni akcenat | `#0E7C86` (duboka teal — dugmad, aktivna reč, highlight) |
| Sekundarni akcenat | `#F4B740` (amber — pločice slova, zvezdice) |
| Ćelije asocijacija | `#EAF0F5` (svetlo plavo-siva) |
| Tačno | `#3FB984` (zelena) |
| Pogrešno | `#E5604D` (koralna) |
| Tekst | `#22272B` (tamno grafit) |

Stil: zaobljeni uglovi, blage senke, dosta belog prostora.

### 10.2 Dark mode — "Tamna tema" (v1)
- Pozadina `#161A1D`; teal i amber akcenti svetle; tačno/pogrešno zadržavaju zeleno/koralno.
- Korisnik bira temu u podešavanjima (ili "prati sistem").

### 10.3 Tipografija
- **Nunito** ili **Poppins** (zaobljen, prijateljski sans-serif; oba podržavaju ćirilicu i latinicu sa dijakritikom Š/Đ/Ć/Ś).
- Pločice slova: bold. Asocijacije: lakša težina.

### 10.4 Ikonografija
- Zaobljene, meke ikone (Phosphor ili Lucide).

---

## 11. Ekrani aplikacije (mapa)

1. **Onboarding / izbor jezika i zemlje** (prvo pokretanje)
2. **Početni ekran** — izbor moda (Basic / Advanced), nastavak progresije, login CTA
3. **Ekran igre (Basic)** — tabla + tastatura
4. **Ekran igre (Advanced)** — tabla + paleta od 5 slova + Submit
5. **Ekran rezultata nivoa** — zvezdice, skor, greške, hintovi, "Sledeći nivo"
6. **Podešavanja** — jezik, pismo (Srpski), tema, mod provere (auto-check/bez provere), nalog/login, zvuk/haptika
7. **Admin panel (web, odvojeno)** — rečnici, ličnosti, bulk generator, statistika

---

## 12. Nefunkcionalni zahtevi

- **Performanse:** 60fps animacije; učitavanje nivoa iz lokalnog keša trenutno.
- **Offline-first:** sve osnovne funkcije rade bez interneta dok ima keširanih nivoa.
- **Veličina paketa nivoa:** dimenzionisati da korisnik ima dovoljno nivoa za duže offline igranje.
- **Privatnost:** anonimni ID ne sme da sadrži lične podatke; usklađenost sa Apple/Google smernicama.
- **Skalabilnost backend-a:** bulk generator kao pozadinski job da ne blokira API.
- **Pristupačnost:** dovoljan kontrast, veličina kvadratića prilagođena prstu.

---

## 13. Otvorena pitanja / odluke za fazu implementacije

- Tačna formula skora → zvezdice po pojasevima težine (kalibrisati tokom testiranja).
- Detalji algoritma generisanja (raspored reči, maksimizacija ukrštanja) — dizajnira dev tim.
- Veličina i učestalost preuzimanja paketa nivoa (offline buffer).
- Izvor i licenciranje slika ličnosti.
- Tutorijal/onboarding za mehaniku Advanced moda (preporuka: kratak interaktivni tutorijal na prvom Advanced nivou).

---

## 14. Tehnološki sažetak

| Sloj | Tehnologija |
|---|---|
| Mobilni klijent | React Native + **Expo (managed)** |
| State | Zustand / Redux Toolkit |
| Lokalna baza | SQLite (`expo-sqlite`) |
| Animacije | `react-native-reanimated`, `react-native-gesture-handler` |
| Slike | `expo-image` + Cloudflare CDN (→ R2 kasnije) |
| Lokalizacija | `i18next`, `expo-localization` |
| Haptika | `expo-haptics` |
| Backend | **Node.js + PostgreSQL** (postojeći VPS, nova schema `ukrstene`) |
| API | REST, JSON, JWT, verzionisan `/v1` |
| Auth | Apple Sign-In, Google Sign-In, anonimno |
| Admin | Web panel (rečnici, ličnosti, bulk generator, statistika) |
