# Wayback Domain Topic Checker - Vercel Proxy Version

Tool Next.js để check lịch sử domain qua Wayback Machine, tính tuổi domain, lấy năm archive đầu/cuối, phân loại topic cơ bản và hỗ trợ proxy khi deploy trên Vercel.

## Tính năng

- Check nhiều domain, mỗi dòng một domain
- Dùng Wayback CDX API
- Lấy first year / last year / tuổi domain
- Check nhiều snapshot đại diện thay vì chỉ 1 snapshot
- Phân loại topic cơ bản: Gambling / Adult / Pharma / Crypto / Shop / Tech / Blog
- Hỗ trợ proxy bằng ENV `PROXY_URL` hoặc `PROXY_URLS`
- Chạy bằng Next.js App Router trên Vercel Node.js Runtime

## Chạy local

```bash
npm install
npm run dev
```

Mở:

```txt
http://localhost:3000
```

## ENV proxy

Tạo file `.env.local` khi chạy local:

```env
PROXY_URL=http://user:pass@ip:port
```

Hoặc nhiều proxy:

```env
PROXY_URLS=http://user:pass@ip1:port,http://user:pass@ip2:port
```

Nếu không có proxy, app vẫn chạy nhưng dễ dính 429 hơn.

## Deploy lên Vercel

1. Push source này lên GitHub
2. Vào Vercel -> Add New Project
3. Import repo GitHub
4. Framework Preset: Next.js
5. Vào Settings -> Environment Variables
6. Thêm:

```env
PROXY_URL=http://user:pass@ip:port
```

Hoặc:

```env
PROXY_URLS=http://user:pass@ip1:port,http://user:pass@ip2:port
```

7. Deploy lại project

## Lưu ý Vercel

File API đã set:

```js
export const runtime = 'nodejs';
export const maxDuration = 60;
```

Không đổi sang Edge Runtime vì proxy agent cần Node.js runtime.

## API

```txt
GET /api/check?domain=example.com
```

Response mẫu:

```json
{
  "domain": "example.com",
  "archived": true,
  "age": 17,
  "firstYear": "2009",
  "lastYear": "2026",
  "totalSnapshots": 438,
  "snapshotsChecked": 5,
  "topics": ["Tech"],
  "snapshotUrl": "https://web.archive.org/web/*/example.com",
  "proxy": true
}
```

## Gợi ý batch

Trên Vercel không nên check quá nhiều domain trong một lượt. Nên dùng khoảng 10-30 domain/lượt để tránh timeout.
