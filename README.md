# Panduan Deployment Menggunakan Git Tag (Semantic Versioning)

Dokumen ini menjelaskan alur kerja (workflow) untuk merilis aplikasi ke server production menggunakan GitLab CI/CD, Git Tag, dan Docker Compose.

---

## 0. Development Lokal (docker-compose-dev)

Untuk development di lokal, gunakan `docker-compose-dev.yml`. File ini menjalankan semua service (PostgreSQL, app, Nginx) di Docker — tidak perlu install Node.js, PostgreSQL, atau konfigurasi .env manual.

```bash
docker compose -f docker-compose-dev.yml up -d --build
```

Buka `http://localhost:3000` di browser.

**Fitur:**
- Auto reload saat edit code (source code di-bind mount ke container)
- Tidak perlu install Node.js di laptop
- Tidak perlu setup PostgreSQL manual
- Tidak perlu file `.env` (environment sudah di-set di compose) fully isolated

**Sehari-hari:**
```bash
# Nyalakan
docker compose -f docker-compose-dev.yml up -d

# Edit code di IDE → otomatis reload

# Lihat log app
docker compose -f docker-compose-dev.yml logs -f todo-app

# Matikan
docker compose -f docker-compose-dev.yml down
```

**Rebuild (kalau tambah dependency baru):**
```bash
docker compose -f docker-compose-dev.yml up -d --build
```

---

## 1. Konsep Utama
*   **Aman:** Anda hanya merilis fitur ke server jika sudah benar-benar siap (di-tag). Push biasa ke branch `main` tidak akan mengganggu server production.
*   **Dinamis & Lacak Mudah:** Image yang ter-deploy memiliki nama sesuai versi aslinya, misalnya `1.2.1`. Jadi kalau ada error di server, Anda tinggal melihat tag mana yang berjalan.
*   **Rollback Cepat:** Tinggal panggil `docker-compose up` dengan versi sebelumnya jika ada bug kritis.

---

## 2. Alur Kerja (Workflow) Developer

Setiap kali Anda selesai mengerjakan fitur baru atau memperbaiki bug, lakukan _commit_ dan _push_ ke branch mana saja (termasuk `main`) seperti biasa:

```bash
git add .
git commit -m "feat: menambah fitur login"
git push origin main
```
*(Ingat: Langkah di atas **TIDAK** akan memicu deploy ke server)*

---

## 3. Proses Rilis Versi Baru (Trigger Deploy)

Ketika Anda merasa fitur-fitur di `main` sudah stabil dan siap dirilis ke user nyata, Anda membuat **Git Tag**. 

Misalkan versi aplikasi terakhir adalah `1.2.0`, dan rilis kali ini adalah `1.2.1`. Jalankan ini di lokal terminal Anda:

```bash
# 1. Buat tag baru 
git tag 1.2.1

# 2. Kirim tag tersebut ke GitLab
git push origin 1.2.1
```

*(Atau Anda bisa membuat tag/release langsung melalui antarmuka web GitLab).*

---

## 4. Apa yang Terjadi di Balik Layar (GitLab CI)?

Setelah Anda mengirim tag `1.2.1` ke GitLab, pipeline (`.gitlab-ci.yml`) otomatis berjalan. Inilah langkah demi langkah yang dikerjakan oleh robot GitLab:

### Tahap 1: Build
1. GitLab melihat aturan `only: - tags` dan menyetujui berjalannya pipeline.
2. GitLab CI login ke akun Docker Hub Anda.
3. Menjalankan perintah build: 
   `docker build -t guaryyyyy/todo-app:1.2.1 .`
   *(Perhatikan bahwa tag `1.2.1` diambil dari variabel bawaan `$CI_COMMIT_TAG`)*
4. Menjalankan perintah push: 
   `docker push guaryyyyy/todo-app:1.2.1`

### Tahap 2: Deploy ke Server
1. Runner GitLab menghubungkan diri ke server VPS Anda (`47.130.103.6`) via SSH.
2. Runner mengeksekusi script SSH yang menyuntikkan variabel (inline injection):
   ```bash
   APP_VERSION=1.2.1 docker compose up -d
   ```
3. Docker Compose di VPS membaca file `docker-compose.yml` Anda. Ia melihat ada perintah `image: guaryyyyy/todo-app:${APP_VERSION:-latest}`.
4. Karena ada sisipan `APP_VERSION=1.2.1`, ia akan mem-**PULL** otomatis image versi `1.2.1` dari Docker Hub.
5. Container versi lama dimatikan, dan diganti oleh container `1.2.1` dengan sangat mulus (tanpa downtime panjang).

---

## 5. Cara Rollback Jika Terjadi Error

Jika ternyata versi `1.2.1` membuat aplikasi crash parah, Anda tidak perlu panik atau build ulang. 
Anda hanya perlu masuk ke VPS dan memutar waktu ke versi sebelumnya (misalnya `1.2.0`) dengan 1 baris perintah:

```bash
# Login ke server
ssh ubuntu@47.130.113.123

# Masuk ke folder project
cd /path/ke/folder/project

# Mundurkan ke versi 1.2.0 (sangat cepat karena image biasanya masih tersimpan di server)
APP_VERSION=1.2.0 docker compose up -d
```
Aplikasi Anda akan seketika hidup kembali di versi lama yang aman.

---

## 6. Housekeeping (Pembersihan Image Lama)

Seiring berjalannya waktu, server VPS Anda akan penuh dengan image Docker versi lama. Docker **tidak** menghapus image lama ini secara otomatis agar Anda bisa melakukan *rollback* dengan cepat.

**Best Practice Industri:**
Jangan menghapus image lama *seketika* persis setelah deploy. Tetap simpan 1-2 versi terakhir untuk berjaga-jaga. Cara paling umum adalah mengatur pembersihan otomatis di server (misalnya menggunakan fitur `cron` di Ubuntu setiap hari Minggu tengah malam):

```bash
# Perintah untuk menghapus semua image Docker yang tidak sedang dipakai
docker image prune -a -f
```

*(Atau, Anda bisa menyisipkan perintah `docker image prune -a -f --filter "until=168h"` di bagian paling akhir script SSH di `.gitlab-ci.yml` Anda untuk menghapus otomatis image yang usianya sudah lebih dari 7 hari setiap kali rilis baru).*
