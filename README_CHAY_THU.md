# StudySpace Web - Gói bàn giao cho team

Thu muc nay gom:

- `web/`: source code web StudySpace Admin.
- `database/namt_studyspace_latest_20260604.sql`: dump PostgreSQL moi nhat, gom schema, function, trigger va data demo.
- `database/studyspace_after_dump_patches.sql`: tat ca patch sau dump, gom tai khoan, qua rank, goi/order, kho, ca lam, bao cao va cac trigger/fix moi.

## 1. Yeu cau tren may nguoi chay

- Node.js 18+.
- PostgreSQL.
- Co quyen tao/xoa database local.

## 2. Lay code bang Git

Lan dau lay code:

```bash
git clone <URL_REPO_GITHUB>
cd StudySpace_team_package_20260603
```

Nhung lan sau cap nhat code:

```bash
cd StudySpace_team_package_20260603
git pull
```

File `.env` chua mat khau PostgreSQL chi nam tren may tung nguoi va khong duoc commit len Git. Moi may tao `.env` tu `web/.env.example` theo muc cau hinh ben duoi.

## 3. Tao database tu dump

Neu may da co database `namt_studyspace` cu, nen drop va tao lai:

```bash
dropdb -U postgres --if-exists namt_studyspace
createdb -U postgres namt_studyspace
psql -U postgres -d namt_studyspace -f database/namt_studyspace_latest_20260604.sql
psql -U postgres -d namt_studyspace -f database/studyspace_after_dump_patches.sql
```

Neu PostgreSQL cua may dung port/user khac, sua lai `-U postgres` hoac them `-h localhost -p 5432`.

## 4. Cau hinh ket noi database

Vao thu muc `web/`, tao file `.env` tu file mau:

```bash
cd web
cp .env.example .env
```

Mo `.env` va sua mat khau PostgreSQL cho dung may dang chay:

```env
DATABASE_URL=postgresql://postgres:MAT_KHAU_POSTGRES@localhost:5432/namt_studyspace
PORT=3001
```

Neu may dung dung user/mat khau nhu may goc thi co the giu nguyen:

```env
DATABASE_URL=postgresql://postgres:quocanh26@localhost:5432/namt_studyspace
PORT=3001
```

## 5. Cai package va chay web

Trong thu muc `web/`:

```bash
npm install
npm run dev
```

Mo trinh duyet:

```text
http://127.0.0.1:5173/
```

Dang nhap nhan vien mac dinh:

```text
username: admin
password: admin123
```

Tai khoan khach hang co the tao truc tiep tren man hinh dang nhap. Khach hang chi xem duoc thong tin ca nhan, lich su order, goi va qua cua chinh minh; cac tab kho/order/bao cao/ca lam chi danh cho nhan vien.

Backend API chay o:

```text
http://127.0.0.1:3001/api/health
```

## 6. Kiem tra nhanh

Sau khi chay `npm run dev`, co the test:

```bash
curl http://127.0.0.1:3001/api/health
```

Neu thanh cong, API se tra JSON co `ok: true`.

## 7. Loi thuong gap

### Loi password PostgreSQL

Sua `web/.env`, doi `DATABASE_URL` theo dung user/mat khau tren may nguoi chay.

### Loi database khong ton tai

Chay lai buoc tao database:

```bash
createdb -U postgres namt_studyspace
psql -U postgres -d namt_studyspace -f database/namt_studyspace_latest_20260604.sql
psql -U postgres -d namt_studyspace -f database/studyspace_after_dump_patches.sql
```

### Port 5173 hoac 3001 dang bi chiem

- Tat process dang dung port do, hoac
- Doi `PORT` trong `.env` cho backend.

Neu doi backend port, can sua proxy trong `web/vite.config.ts` cho khop.

## 8. Ghi chu

Khong can gui `node_modules` vi team se cai lai bang `npm install`.
Khong can gui `dist` vi team co the build lai bang:

```bash
npm run build
```

## 9. Quy tac order va goi

- Tab `Orders` chi tao order su dung cho ngoi/phong, hien chi cho chon `DV01` va `DV02`.
- `DV03` va `DV04` la goi hoat dong; dang ky va gia han thuc hien trong tab `Goi`. Chuc nang huy goi da tat de khong phai mo rong schema trang thai.
- Backend va trigger PostgreSQL deu chan viec tao order moi bang `DV03` hoac `DV04`.
- Neu khach co goi hoat dong, khi tao order co the chon `Dung goi`. Lua chon nay duoc luu tren tung order bang `orders.sudunggoi`, khong tu dong mien phi tat ca order cua khach.
- Order dung goi lay han su dung theo `goihoatdong.ngayketthuc`; khong bi tinh phat qua gio theo moc 3h/5h cua `DV01`/`DV02`. Neu khong chon dung goi, order van tinh tien dich vu va phat qua gio nhu binh thuong.

## 10. Quy tac kho va vat pham

- Moi loai vat pham chi thuoc mot kho co dinh.
- Ten vat pham la duy nhat, ke ca khi khac hoa/thuong hoac co khoang trang thua.
- Tab `Kho` chi dung de nhap them so luong cho vat pham co san.
- Tab `Tao vat pham` dung de tao loai moi va bat buoc chon kho.
- Trigger database chan tao vat pham neu thieu kho va chan chuyen vat pham sang kho khac sau khi tao.

## 11. Chuc nang rank va qua tang

- Khi thanh toan lam khach len rank, database tu goi `fn_tang_qua_rankup`, tru kho va ghi vao `lichsu_quatang`.
- Tab `Qua rank` hien lich su qua rank-up, khach/rank/discount va vinh danh thang.
- Diem/rank cua khach chi tang qua luong thanh toan order; neu thanh toan lam rank up, web se hien thong bao va chuyen sang tab `Qua rank`.
- Vinh danh thang phat thuong theo dung hang trong thang/nam da chon; database chan thuong lap lai cung mot hang trong cung ky.

## 12. Quy tac ca lam

- Tab `Ca lam` hien lich trong 1 thang tinh tu ngay hien tai, moi ngay co `Ca Sang`, `Ca Chieu`, `Ca Toi`.
- Neu chua co nhan vien nao nhan ca, he thong van hien ca do voi trang thai `Chua co nguoi`, so NV = 0 va thieu 3.
- Khi nhan ca cho mot ngay/ca chua co san trong bang `calam`, backend tu tao dong ca roi moi them nhan vien vao `dilam`.
- Database van chan moi ca vuot qua 3 nhan vien qua trigger `trg_check_ca_day`.
- Backend va trigger database deu chan nhan ca trong qua khu.

## 13. Ghi chu ve khach hang va tinh tien

- Tai khoan khach hang duoc dat truoc, mua/gia han goi cua minh va goi mon cho order cua minh dang `Dang dung`.
- Khach hang khong tao order dung ngay, khong check-in va khong thanh toan; cac viec nay do nhan vien thuc hien.
- Ma order va ID goi do he thong/database tu sinh; web hien dialog sau khi tao thanh cong.
- Cong thuc `fn_thanh_toan` hien tai tinh tien dich vu theo `dichvu.giagoi` cua order. Neu khach co goi hoat dong thi tien dich vu duoc mien phi va chi tinh vat pham. Ham hien chua nhan he so phong rieng/phong 4 vao tien dich vu.
