# 检图 · 图片检测工作台

电脑、手机浏览器均可使用的客户端图片检测工具。照片只在当前页面内存中处理，不上传服务器，刷新/关闭页面前请导出 Excel。

- 批量添加 JPG、PNG、WebP，最多 30 张、每张 20 MB。
- ZXing 从图片解码条形码，支持常见一维码，尝试旋转及缩放。
- Tesseract 中文/英文 OCR 提取 `A 通过 B 不通过 P 通过` 等明确文字；缺失、冲突及未识别结果保留为待确认。仅有图形标记或复杂表格的照片可能需要手动校对。
- 查看原图、修改条形码、增删检测项、修改通过/不通过/待确认。
- 导出真实 XLSX，含照片缩略图、条形码文本（保留前导零）、动态检测项列、校对状态及 OCR 原文工作表。
- 模型随站点托管，首次使用需要下载约 4 MB 语言模型及识别核心。语言模型通过浏览器缓存复用；不是离线安装包。

## 开发

需要 Node.js 22.13+。

```sh
npm install
npm run dev
npm run build
```

`public/ocr` 包含 Tesseract.js 6.0.1 worker、同版本依赖的核心文件，以及 naptha/tessdata 4.0.0_best_int 中文/英文语言数据。来源：
- https://github.com/naptha/tesseract.js
- https://github.com/naptha/tessdata
- https://github.com/zxing-js/browser
- https://github.com/exceljs/exceljs

## 验证记录

已通过 TypeScript 检查、生产构建、中文 OCR 图片识别、Code 128 条形码解码、检测结果解析及 XLSX 导出后重新读取测试。测试图片为合成的清晰标准图片，未获得实际业务照片；真实拍照的识别效果需用业务样本核验。OCR 不保证完整识别每一项，因此每张新识别照片都标为待确认。

未运行浏览器交互测试。只读 WebMCP `read_inspection_results` 在浏览器支持时注册；当前没有可用的 WebMCP 验证环境，未验证此可选接口。

测试脚本在 `tests/`；测试图片和导出产物保存在本地忽略目录 `test-output/`。
