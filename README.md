# Rumah Gurita: Dimensi Gaib

Game horor survival 3D WebGL berbasis legenda urban Bandung oleh **Worth-IT Studios** — **Kangpcode (Dhafa Nazula Permadi)**.

> **Catatan Etika & Fiksi:**  
> Game ini adalah karya fiksi. Rumah aslinya adalah hunian pribadi milik Sang Pemilik ("Pak Fransiskus") dan bukan tempat angker. Mohon tidak mengunjungi atau mengganggu penghuni maupun warga sekitar.

---

## Ringkasan Permainan

Berlatar di **Jalan Sukajadi, Bandung**, pemain bergabung dengan *Klub Penasaran Sukajadi* untuk menyusul Rani yang menghilang saat melakukan siaran langsung di sekitar Rumah Gurita. Untuk keluar selamat dari **Dimensi Gaib**, pemain harus bertahan dari ancaman entitas gaib sembari mengumpulkan bukti nyata guna membantah mitos di dalam **Jurnal Fakta**.

### Fitur Utama

- **Eksplorasi 4 Zona / 3 Lantai:** Area Jalan Sukajadi (*outside* — Warung Ceu Titin, Pos Ronda Pak Ujang, Baliho Windah, gerbang & halaman depan), Lantai Dasar (*ground*), Lantai 2 (*second*), dan Rooftop (*roof* — Kolam Atap, Patung Gurita, & Menara Radio `104.6 MHz`).
- **Mekanik Debunk Rumor → Fakta (6 Segel):** Kumpulkan **Bukti Nyata** (sering terungkap dengan **Kamera UV**) untuk mematahkan 6 segel rumor di **Jurnal** (`[J]`) dan melemahkan bos **Ambu Hideung**.
- **Senter & Kamera UV dengan Baterai Terpisah:** Kelola daya **Senter** (`[F]`) dan **Kamera UV** (`[Q]`) secara independen.
- **Survival & Stealth:** Kelola **Sanity**, **Stamina**, tingkat kebisingan langkah saat berlari vs jongkok, lempar **Garam** (`[G]`) untuk menahan serangan sementara, atau bersembunyi di lemari serta berlindung di **Zona Aman**.
- **Perspektif Ganda & Mobile Friendly:** Beralih antara sudut pandang *First-Person* dan *Third-Person* (`[V]`), serta dukungan **Kontrol Sentuh Layar** untuk perangkat mobile.
- **Mode Solo dengan Rekan AI:** Bermain sendiri atau ditemani hingga 3 rekan AI (*AI Companion*) pada tingkat kesulitan `Santai`, `Normal`, atau `Mimpi Buruk`.
- **Multiplayer Co-op Real-Time & Voice Chat:**
  - *Quick Play* dengan pencocokan room publik (serta tawaran bot AI setelah 30 detik menunggu).
  - Buat/Gabung Room dengan kode 5 karakter (tanpa huruf/angka ambigu `O`, `0`, `I`, `1`), dukungan password, filter bahasa/region/kesulitan, *Late Join*, dan *Reconnect Grace Period* 60 detik.
  - Sinkronisasi posisi pemain, aksi dunia bersama, sistem *downed/revive*, chat dalam game (`[T]`), dan *Voice Chat* WebRTC (`[B]`).
  - Kustomisasi kosmetik tas dan aksesori karakter.
- **3 Akhir Cerita (Ending):** `True Ending`, `Normal Ending`, dan `Bad Ending` berdasarkan jumlah Segel Fakta yang dipatahkan, penyelamatan Rani, dan kondisi tim.

---

## Karakter yang Dapat Dimainkan

| Karakter | Peran | Skill Utama | Efek |
| --- | --- | --- | --- |
| **Raka** | Ketua Klub · Rasional & Skeptis | **Debunker** | Fakta melemahkan Ambu Hideung 35% lebih kuat & Sanity lebih stabil |
| **Salsa** | Jurnalis Sekolah · Pengumpul Arsip | **Arsip** | Petunjuk & bukti tersembunyi menyala lebih terang di jarak jauh |
| **Bima** | Teknisi & Perangkat Radio | **Teknisi** | Baterai senter & Kamera UV 40% lebih awet |
| **Nadia** | Pemberani · Kakak dari Rani | **Lincah** | Lari 15% lebih cepat & langkah sangat senyap saat jongkok |
| **Dito** | Sensitif · Peka Energi | **Peka** | Mendeteksi arah & jarak hantu terdekat langsung di HUD |

---

## Kontrol Permainan (Desktop)

| Tombol | Aksi |
| --- | --- |
| `W` `A` `S` `D` / Tombol Panah | Bergerak |
| `Shift` | Lari (*Sprint*) |
| `C` / `Ctrl Kiri` | Jongkok (*Crouch* — mengurangi kebisingan) |
| `E` | Interaksi (buka pintu, ambil kunci/bukti/garam, bicara NPC, sembunyi, setel radio) |
| `F` | Nyalakan / Matikan Senter |
| `Q` | Aktifkan / Nonaktifkan Kamera UV |
| `G` | Gunakan Garam Pelindung |
| `V` | Ganti Perspektif (*First-Person* / *Third-Person*) |
| `J` | Buka / Tutup Jurnal Fakta |
| `M` | Bisukan / Aktifkan Audio |
| `T` | Chat Dalam Game *(khusus Multiplayer)* |
| `B` | Toggle Mikrofon Voice Chat *(khusus Multiplayer dengan Voice Chat aktif)* |
| `P` / `Esc` | Jeda Permainan / Tutup Modal |

> Pada perangkat layar sentuh atau layar kecil, **Kontrol Sentuh Layar (Mobile)** aktif otomatis dan dapat diatur ulang melalui menu **Pengaturan**.

---

## Teknologi

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion, Three.js (WebGL 3D & model prosedural), Web Audio API
- **Backend & Real-Time:** Node.js, Express 4, Socket.IO 4, WebRTC (signaling peer-to-peer untuk voice chat)
- **Build & Tooling:** Vite 8, `tsx`, `node:test`

---

## Struktur Direktori

```text
.
├── index.html                  # Entry HTML & metadata halaman
├── server.ts                   # Server Express + Socket.IO + Vite/dist middleware
├── metadata.json               # Metadata aplikasi
├── .env.example                # Contoh variabel lingkungan
├── public/assets/aistudio/     # Aset visual statis
└── src/
    ├── App.tsx                 # Orkestrasi UI, state game, & koneksi multiplayer
    ├── main.tsx                # Bootstrap React
    ├── index.css               # Gaya global & tema arsip horor
    ├── components/             # HUD, TitleScreen, MultiplayerModal, PuzzleModal, dll.
    ├── game/
    │   ├── HorrorWorld.ts      # Engine 3D Three.js, AI hantu, loop gameplay
    │   ├── levelData.ts        # Tata letak 3 lantai, Jalan Sukajadi, pintu, & prop
    │   ├── proceduralModels.ts # Pembentuk mesh 3D karakter, hantu, & properti
    │   ├── audioEngine.ts      # Audio & efek suara prosedural Web Audio
    │   ├── collision.ts        # Resolusi tabrakan AABB, tangga, safe zone, & LoS
    │   ├── rules.ts            # Aturan game (debunk, baterai, ending, objektif)
    │   ├── data.ts             # Data studio, karakter, rumor, dialog NPC
    │   └── rules.test.ts       # Unit test aturan & fisika game
    ├── net/
    │   ├── lobbyClient.ts      # Klien Socket.IO lobby & sinkronisasi gameplay
    │   └── voiceChat.ts        # Manajer WebRTC Voice Chat co-op
    ├── server/
    │   └── roomManager.ts      # Manajemen room, matchmaking, host migration, validasi
    └── shared/
        ├── lobbyProtocol.ts    # Kontrak protokol lobby, kode room, & filter nickname
        └── lobbyProtocol.test.ts # Unit test protokol & RoomManager
```

---

## Cara Menjalankan

### 1. Prasyarat

- **Node.js** (disarankan v20+ / v22+)
- **npm** (atau package manager yang kompatibel)

### 2. Instalasi Dependensi

```bash
npm install
```

### 3. Konfigurasi Lingkungan (Opsional)

Salin `.env.example` menjadi `.env` jika diperlukan (misalnya `PORT`, default `3000`):

```bash
cp .env.example .env
```

### 4. Mode Pengembangan (Development)

Menjalankan server Express + Socket.IO bersama middleware Vite di `http://localhost:3000`:

```bash
npm run dev
```

### 5. Build & Mode Produksi

Bangun aset frontend terlebih dahulu ke direktori `dist/`, lalu jalankan server dalam mode produksi:

```bash
npm run build
NODE_ENV=production npm start
```

---

## Pengujian & Pemeriksaan Kode

- **Type-check TypeScript:**

  ```bash
  npm run lint
  ```

- **Jalankan Unit Test (`node:test` via `tsx`):**

  ```bash
  npx tsx --test src/game/rules.test.ts src/shared/lobbyProtocol.test.ts
  ```

---

## Endpoint REST Server

- `GET /api/health` — Pemeriksaan status server dan versi game (`{ ok, version }`).
- `GET /api/rooms` — Daftar room multiplayer publik dengan dukungan query `search`, `difficulty`, `language`, `region`, dan `hideFull`.

---

## Lisensi

Proyek ini dilisensikan di bawah ketentuan yang tercantum pada berkas [LISENCE.md](./LISENCE.md).
