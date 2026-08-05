# Supabase 連線設定

1. 在 Supabase 建立一個新專案。
2. 於 SQL Editor 執行 `supabase-schema.sql`。
3. 在 Authentication 的 URL Configuration 加入：
   - `https://kris0425.github.io/moyun-qinsheng/`
   - `https://kris0425.github.io/moyun-qinsheng/admin.html`
4. 於 Authentication 建立第一位管理員帳號。
5. 在 SQL Editor 執行：

   ```sql
   update public.profiles
   set role = 'admin'
   where email = '管理員信箱';
   ```

6. 將 Project URL 與 Publishable Key 填入 `supabase-config.js`。

只可放入 Publishable Key，絕不可放入 `service_role` key。
