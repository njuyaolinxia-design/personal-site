# 个人简历与知识博客

Astro 静态站点：简历、项目、电子名片与 Markdown 文章。构建产物是 `dist/`，国内普通 Linux 服务器可直接用 Nginx 托管，服务器不需要运行 Node.js。

当前线上地址：[个人简历网站](https://old-sun-267c.nju-yaolinxia.workers.dev/)（Cloudflare Worker 静态资源，手动部署）。

## 本地运行

需要 Node.js 22 或更新版本。

在仓库根目录运行：

```powershell
npm.cmd install
npm.cmd run dev
```

按终端显示的地址在浏览器中预览。发布前运行：

```powershell
npm.cmd run build
```

## 填写正式内容

1. 修改 `src/data/profile.ts`：姓名、定位、简介、公开联系方式、工作经历、项目案例和教育背景。现有经历已根据提供的简历整理成公开版，内部项目名称及精确业务指标需要本人确认后再添加。
2. 在 `src/pages/blog/` 新建 `.md` 文章，复制现有文章的 frontmatter 字段，设置标题、摘要、日期、分类和标签。文件名会成为文章网址。不要将内部地址、客户数据、凭据、未公开项目细节写入公开文章。
3. 域名确定后，在 `astro.config.mjs` 中添加 `site: 'https://你的域名'`，以生成正式 canonical 地址；同时把真实备案号填写到 `profile.ts`，未备案时保持空值。
4. 每次修改内容后重新运行 `npm.cmd run build`，将新的 `dist/` 发布到服务器。

目前联系方式仍待确认，`from-notes-to-article.md` 是明确标记的示例文章。

## 更新当前 Cloudflare 站点

运行 `npm.cmd run build` 后，将 `dist/` 内的文件打包为 ZIP，并在 Cloudflare 控制台为现有 Worker 创建新部署。代码仓库的提交目前不会自动触发线上部署。

## 中国内地服务器部署

先准备域名、可备案的中国内地服务器、实名认证及 ICP 备案。对外开放网站前，核对接入商的备案要求；上线后按要求办理公安联网备案并展示编号。

以 Ubuntu + Nginx 为例，服务器准备完成后：

```bash
sudo apt update
sudo apt install nginx
sudo mkdir -p /var/www/personal-site
```

将本地 `dist/` 下的**全部内容**上传到 `/var/www/personal-site/`。复制 `deploy/nginx.example.conf` 到 `/etc/nginx/sites-available/personal-site`，替换 `server_name` 和站点目录，再启用：

```bash
sudo ln -s /etc/nginx/sites-available/personal-site /etc/nginx/sites-enabled/personal-site
sudo nginx -t
sudo systemctl reload nginx
```

域名解析、HTTPS 证书与自动续期应根据最终云厂商和域名确定后配置。实际部署前先备份现有站点目录，不要把整个笔记库上传到服务器；只上传构建出的 `dist/`。

## 目录

- `src/data/profile.ts`：简历和名片的公开资料
- `src/pages/blog/*.md`：博客原稿
- `src/pages/`：页面
- `deploy/nginx.example.conf`：Nginx 配置示例
- `dist/`：构建产物
