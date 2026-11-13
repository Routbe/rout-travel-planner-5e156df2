ROUT — Technisch Overdrachtsdossier & Architectuur-Invariants

> Instructie voor de overnemende engineer / AI:
> ROUT is een soevereine identiteits-, betaal- en hardware-beveiligingsstack (met fysieke NTAG 424 DNA NFC-kaarten, post-quantum/HPKE encryptie, passkey-only authenticatie en zero-trust database RLS).
> Ga hier nooit lichtzinnig mee om: geen snelle hacks, geen RLS uitschakelen, geen plaintext tokens in logs of URL’s, geen security definer functies schrijven zonder `SET search_path = pg_catalog`, en breek nooit de encryptie- of rollen-grenzen. Lees altijd eerst de `AGENTS.md` bestanden in de relevante mappen (`src/lib/`, `src/lib/wallet/`, `src/components/dashboard/`, etc.) voordat je code aanraakt.

---

1. Technologische Stack & Kerninfrastructuur

- Frontend & Fullstack Framework: TanStack Start v1 (React 19, Vite 7) getarget op Edge runtimes (Cloudflare Workers / workerd compatibel).
- Styling: Tailwind CSS v4 via `src/styles.css` met semantische design tokens (geen hardcoded hex-kleuren).
- Authenticatie: Better Auth gekoppeld via Kysely adapter met strikte passkey-only hooks.
- Database: Neon Postgres (serverless).
  - Runtime verbinding: strikt via de rol `rout_app` (geen superuser, geen BYPASSRLS). Elke batch/transactie draait onder `set local role rout_app`.
  - Migratiemodel: opeenvolgende SQL-migraties in `db/`.
  - Huidig schemaniveau: `0253` (bevestigd via `src/lib/schema-version.ts` en de `/api/public/health` probe).
- Kluis & Encryptie: `vault_enclave` Postgres-schema. Tabellen hebben een strikt `deny_all` RLS-beleid; de app bereikt de kluis enkel via SECURITY DEFINER RPC’s.
- Standalone Daemon: `worker/` (Omni daemon voor Bun/Linux met Sharp/FFmpeg/persistent LISTEN). Nooit importeren in TanStack routes of serverfuncties.

---

2. Wat is er recent gerealiseerd & hersteld?

A. ROUT Card Hardware MFA (NFC Step-Up via NTAG 424 DNA)
Fysieke metalen ROUT Cards zijn voorzien van NXP NTAG 424 DNA chips met Secure Dynamic Messaging (SDM).
1. Cryptografische verificatie (`src/lib/vault/sdm-verifier.ts`):
   - AN10922 sleuteldiversificatie met AES-128.
   - Decryptie van `PICCData` (UID + strictly rising tap counter) en CMAC-verificatie in constant-time vergelijking (`ct_equal_32`).
   - Anti-replay: elke tik vereist een strikt hogere teller dan de vorige geregistreerde tik.
2. Step-Up methode `"card"` (`src/lib/auth/card-step-up.*`):
   - Geaccepteerd voor gevoelige kaartacties (`card_reveal`, `card_lifecycle`) en algemene accountbeveiliging.
   - Android: Direct scannen in de `StepUpDialog` via de Web NFC API (`NDEFReader`).
   - iPhone & Desktop fallback via `/t`: De iPhone tikt de kaart en opent `https://rout.be/t?p=<PICCData>&m=<CMAC>`.
3. Kritieke Security-vondst & Fix (Migratie 0253):
   - In migratie `0250` ontbraken de audit-acties voor card step-up in de check-constraint van `vault_enclave.audit_log`, waardoor kaartbevestigingen crashten. Dit is opgelost in `db/0253_card_revoke.sql`.
   - Fysieke chip intrekking bij verlies: Als een kaart wordt geblokkeerd of vervangen (`blockMyCard` / `replaceMyCard`), roept de server `vault_enclave.revoke_member_cards()` aan. Alle fysieke NTAG-chips van die gebruiker worden onmiddellijk ingetrokken (`revoked_at = NOW()`) en openstaande step-up intents vervallen. Een gestolen of verloren kaart kan dus nooit meer iets goedkeuren.
4. Anti-Session-Hijack op `/t` (Expliciete Bevestiging):
   - Als een ingelogde gebruiker `/t` opent terwijl er een open step-up intentie is, wordt de intentie niet blind goedgekeurd.
   - De pagina toont expliciet: "Bevestigen met je ROUT Card? Een venster op je computer of telefoon vraagt om bevestiging." met twee knoppen: [Ja, ik bevestig] en [Nee, dit was ik niet]. Pas na een actieve klik wordt de step-up voltooid.

B. Passkey-Only Registratie
- Geen wachtwoorden mogelijk voor nieuwe registraties.
- Afgedwongen via `runPasskeyAccountCreation` in `src/lib/auth/account-creation-scope.ts` en de `user.create.before` hook in `better-auth.server.ts`. Pogingen om buiten de passkey-flow accounts aan te maken worden hard geweigerd.

C. Workspace Studio & Avatar Storage
- Migratie 0251 (`rout_public_avatar`): Publieke leesrechten voor profiel- en workspace-logo's hersteld.
- Migratie 0252 (`rout_prune_avatar_uploads`): Voorkomt dat actieve logo’s van profielen, drafts, workspaces of apps per ongeluk gewist worden tijdens opruimacties.
- Workspace-conversie: `conversionWorkspaceLogo` zet het logo van het live design direct over naar `workspaces.avatar_url`.

D. Ontwikkelaarsconsole — Facturatie & Limieten
- De facturatiepagina (`/console/billing`) is ontdaan van neppe betaalstromen: er is momenteel geen facturatieaccount vereist.
- Live limieten en fair-use voorwaarden worden transparant getoond en zijn vertaald in alle 4 de ondersteunde talen (`nl`, `en`, `fr`, `de`).

---

3. Strikte Architectuur- en Veiligheidsregels (Invariants)

1. Database & RLS Rollen:
   - Nooit queries uitvoeren als superuser in applicatielogica.
   - Migraties volgen het EXPAND / CONTRACT patroon. CONTRACT migraties die oude rechten weghalen moeten in `db-pending/` wachten tot productie de EXPAND migratie draait.
   - `CODE_SCHEMA_LEVEL` in `src/lib/schema-version.ts` moet altijd exact gelijk zijn aan het hoogste migratienummer in `db/`.
2. Kluisgeheimen & Hardware Tokens:
   - Raw tokens verlaten de database nooit in plaintext; ze reizen alleen als opaque refs (`csu_...`, `vtk_...`, `sdm_...`).
   - Private keys en master keys worden in de browser uitsluitend beheerd binnen de Web Worker Crypto Enclave (`src/lib/crypto-enclave/`), nooit op de React UI-thread.
   - Buffers met plaintext of sleutels moeten in `finally`-blokken altijd met nullen worden overschreven (zero-fill).
3. URL & Adresbalk Hygiëne:
   - Bij het openen van `/t?p=...&m=...` wist `history.replaceState` onmiddellijk de query-parameters uit de browsergeschiedenis.
4. Vertalingen:
   - Alle UI-teksten moeten synchroon worden bijgewerkt in `src/locales/pages/interface.nl.json`, `.en.json`, `.fr.json` en `.de.json`.

---

4. Wat moet er nu nog gebeuren? (Openstaande Punten)

1. Fysieke hertest van de bevestigingsknop op iOS:
   - De knop "Ja, ik bevestig" op de `/t` pagina is toegevoegd naar aanleiding van de security-verstrakking.
   - Testscenario: Start op desktop een gevoelige actie (bijv. kaart ontgrendelen of bevriezen) -> kies "ROUT Card" -> tik met iPhone de kaart tegen de achterkant -> Safari opent `/t` -> druk op "Ja, ik bevestig" -> controleer of het venster op desktop direct doorloopt en ontgrendelt.
2. Workspace Logo Cascade Edge-Case (Documentatie / Toekomstig):
   - Als een persoonlijk account wordt omgezet naar een workspace en de foto staat in de Neon fallback-tabel, blijft de upload foreign-key gekoppeld aan de oorspronkelijke gebruiker. Als er in de toekomst een harde account-verwijdering ("Purge account") wordt gebouwd, moet dit bestand eerst overgedragen worden aan de workspace owner om cascade-deletie te voorkomen.
3. Optionele Externe Integraties (Momenteel bewust leeg gelaten):
   - Zodra de eigenaar live wil gaan met externe diensten, moeten de volgende geheimen in de omgevingsvariabelen geconfigureerd worden:
     - Stripe (voor PSP/donaties en eventuele betaalde plannen).
     - Scaleway S3 Object Storage (voor cloud buckets; momenteel vangt Neon uploads op).
     - Apple Developer Certificaten (voor Apple VAS / NFC Wallet kaarten).
     - Google Wallet API service account (voor Google Smart Tap & Loyalty kaarten).

---

5. Handige Commando's voor Verificatie

- Tests draaien:
  ```bash
  bun test
  bunx vitest run src/test/card-step-up.test.ts src/test/sdm-tap.test.ts src/test/schema-version.test.ts
  ```
- Schema snapshot & catalogus bijwerken:
  ```bash
  bun scripts/schema-replay-snapshot.ts
  ```
- Gezondheidsstatus controleren:
  Inspecteer `http://localhost:8080/api/public/health`. Dit moet `status: "operational"` en `schema_level: "0253"` teruggeven.

---

Bijlage — controle tegen de code (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- De SDM-verifier staat in `src/lib/crypto-enclave/sdm-verifier.ts` (niet `src/lib/vault/`).
- De audit-tabel heet `vault_enclave.audit_logs` (constraint `audit_logs_action_check`).
- `bun test` start de testrunner van Bun; de projectsuite draait met Vitest via `bun run test` (`vitest run`).
- Openstaand punt 1 (iOS-hertest van "Ja, ik bevestig" op `/t`): door de eigenaar bevestigd als werkend op 2026-11-13.
- Neon op 2026-11-13: `public.schema_migrations` bevat alles t/m 0253. Twee geregistreerde bestanden bestaan niet meer in `db/` (`95_question_stories.sql`, `0169_workspace_icon.sql`) en twee bestanden wijken af van hun geregistreerde checksum (`0209_recovery_vault_pairwise.sql`, `91_shadowban.sql`).
