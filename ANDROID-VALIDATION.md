# Android 验收记录

测试日期：2026-09-07 至 2026-10-14（北京时间）。

## 1.1.0 结果页操作精简（2026-10-14）

- **源码完成**：结果页按钮精简为 `New photo / 重新拍照或上传`，移除尾部重复录入说明；删除动作区底部的 Home / History 跳转按钮，保留固定底部 Tab。重新录入、确认保存、只读历史及结果判断逻辑不变。版本保持 `1.1.0 / 11`。
- **源码与网页检查完成**：TypeScript、定向 lint、`git diff --check`、网站生产构建通过。独立 `localhost:5173` 测试页生成结果后，实际动作区仅有 New photo / Confirm result，底部三项 Tab 均保留，旧文案不存在；点击 New photo 仍进入空白患者表单。用户 `127.0.0.1` 数据未写入测试记录。检查结果：`test-output/result-actions-cleanup/web-checks.json`；测试结果资料区域截图为 `web-result-detail.png`。本轮仅删文案/入口，沿用相同业务逻辑已通过的 67 项 Node 与 13 项 JVM 回归。
- **Android 同步与构建完成**：最终移动端构建、Capacitor 同步、debug/release 构建通过；两个 APK 各 16 个资源与 `dist-mobile/` 和 Android 同步目录逐字节一致。证据位于 `test-output/result-actions-cleanup/`。
- **当前正式 APK**：`releases/GenDX_T-1.1.0-release.apk`，6,501,121 字节，SHA-256 `a21ac38916d9dee6cc61be46f28b26d42076ccc4181a43214c5ab53b0e293bf4`。v2 验签通过，原正式证书 SHA-256 保持 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9`。debug SHA-256 为 `20d3219b960b05f6c73402b5a8bcfdd34e21aea4ce8b9797c21d933b31c095f0`；下方同版本产物为历史构建。
- **模拟器更新完成**：`Medium_Phone_API_36.1 / emulator-5554` 同签名覆盖安装并冷启动，原记录/图片共 2 文件与全部 3 个偏好文件 SHA-256 一致，未卸载、清数据或创建新记录。报告及首页运行截图：`emulator-after/verification.json`、`emulator-after/studio-home.png`。结果页交互本轮在浏览器验证；模拟器未重复尝试此前不可用的 CUA 点击，未做真机相机或选图实测。未发布远程站点。

## 1.1.0 恢复上传照片与并列按钮（2026-10-14）

- **源码完成**：表单增加 Upload photo / 上传照片，与 Take photo / 拍照在全部屏幕保持同一行等宽并列，共用主色、边框、启用/禁用状态和必填校验。每次选一张 JPG、PNG 或 WebP（不超过 20 MB）；取消、空文件、不支持格式、超限或图片解码失败均保留患者草稿，不创建记录。两入口复用 `processPhoto`，患者快照与原图先入库，识别后可确认并只读保存。只有首次入库成功后清空草稿；同一图片可再次用于新的独立录入。
- **Android 源码完成**：复用 `ACTION_OPEN_DOCUMENT` 系统选图入口，显式单选并校验异常多张返回，保留旧多选接口兼容性；取消返回空数组，原生及 JS 异常均清理临时导入文件，保留原读取错误。未新增相册/全盘存储权限。
- **回归与源码检查完成**：67 项 Node 回归通过（含新增 4 项文件格式/大小边界、6 项原生桥参数/取消/读错/清理测试）；原生桥 lint 修复后其 6 项再次通过。13 项 Android JVM 检查通过。最终 TypeScript、定向 lint、`git diff --check`、网站生产构建通过。日志位于 `test-output/photo-upload/`。
- **浏览器流程实测完成**：在独立 `localhost:5173` 测试来源以虚构患者数据上传 `test-img/a-2.jpg`，恢复条码 `01202609030005`、Positive 指示及患者信息，确认保存后刷新，历史仍保留已确认状态。损坏 JPG 的即时界面显示重选提示、草稿保留且两个入口可用；重新开始清空表单，同一图片可创建第二条独立记录。开发热更新期间的一次确认和延后查询作废，已在源码稳定后重新完成确认/持久化验证；详情保留在 `web-checks.json`。用户 `127.0.0.1` 浏览器记录未写入测试数据。
- **布局实测完成**：桌面启用态两按钮均约 406×48px，476px 视口禁用态均为 190×48px、同一 y 坐标、同样背景/边框/文字色及 0.45 透明度；320px 视口均为 122×48px，无水平溢出。截图：`web-entry.png`、`web-result.png`、`web-history.png`。
- **Android 同步与正式 APK 完成**：最终移动端构建、Capacitor 同步、debug/release 构建通过；每个包 16 个资源与 `dist-mobile/` 及 Android 同步目录逐字节一致。版本保持 `1.1.0 / 11`，正式 APK `releases/GenDX_T-1.1.0-release.apk`，6,501,169 字节，SHA-256 `94b683ec8d56039ef89d0b39eeaf9870a0a2fe93a7831e6617f10e3fea043fda`。v2 验签通过，沿用证书 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9`，未替换密钥。debug SHA-256 `db5f9f4f1c977c642bd240d7edd24b9a1c0b2c6e09e6ec37f7010adb6bc19722`；下方同版本产物均为历史构建。
- **模拟器更新完成，选图交互未实测**：`Medium_Phone_API_36.1 / emulator-5554` 同签名覆盖安装最终 debug 并冷启动，原记录与图片共 2 文件及全部 3 个偏好文件 SHA-256 一致。CUA 可读取 Studio 窗口和截图，但点击报 `noWindowsAvailable`，因此未实际打开系统选图器、取消或导入 Android 照片，不把构建/资源一致性当作该交互通过。证据：`emulator-after/verification.json`、`emulator-after/studio-home.png`。未连接物理手机、未新增实际相机或 OTG 验收，未发布远程站点。

## 1.1.0 首页与设置页文案精简（2026-10-14）

- **源码完成**：按截图移除首页底部本机处理说明及图标、设置页副标题、默认导出格式整行、本机记录数量整行及底部记录提示。中英文同步移除，并清理闲置组件参数、回调和样式。设置保留语言、隐私及关于，首页历史入口保留；导出弹窗仍提供全部格式，并兼容读取旧版格式偏好。版本保持 `1.1.0 / 11`。
- **源码与网页检查完成**：TypeScript、定向 lint、网站生产构建通过。浏览器分别核对中英文首页与设置页，指定元素均不存在，设置仅剩三行；英文页面无横向溢出，隐私弹窗可正常打开/关闭。验证后恢复英文。证据：`test-output/ui-copy-cleanup/web-checks.json`、`web-home.png`、`web-settings.png`。识别、记录、导出编码逻辑未改，沿用此前 57 项 Node / 13 项 JVM 通过结果。
- **Android 同步及构建完成**：移动端构建、Capacitor 同步、调试与正式构建通过；两个 APK 各 16 个资源与 `dist-mobile/` 和 Android 同步目录逐字节一致。日志与 `apk-verification.json` 位于 `test-output/ui-copy-cleanup/`。
- **该阶段正式 APK**：`releases/GenDX_T-1.1.0-release.apk`，6,500,257 字节，SHA-256 `30b9065837fe414218c7eb29da9a617530c3747fe979dff8a946f5970b8c0a12`。v2 签名验证通过，证书 SHA-256 仍为 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9`。调试包 SHA-256 为 `fc02a16515b229e9694924075c3b9732dad0899f4a5cbd2ef43b30cde9cfca25`。未生成或替换密钥；最新产物见上方记录。
- **模拟器更新与首页视觉核对完成**：`Medium_Phone_API_36.1 / emulator-5554` 使用本轮同签名 debug APK 覆盖安装并冷启动，保持 `1.1.0 / 11`。原记录与原图共 2 文件及 3 个偏好文件逐字节一致，未卸载或清数据。Android Studio 截图确认首页底部说明已移除、原历史记录数量保留；设置页交互本轮在浏览器验证。证据：`test-output/ui-copy-cleanup/emulator-after/verification.json`、`android-studio.png`。
- **验证范围**：页面及隐私入口在浏览器实测；未做物理设备相机、实际试管识别或 OTG 验收。未发布远程站点。

## 1.1.0 首页文案精简与入口居中（2026-10-14）

- **源码完成**：移除首页设备下方 `GenDx / Infection POCT Innovator` 和主标题上方 `GenDX_T · POINT OF CARE` 文案及闲置样式。Enter / 开始检测文字相对按钮整体居中，箭头独立固定在右侧；英文/中文共用布局，点击流程不变。版本保持 `1.1.0 / 11`。
- **源码与网页检查完成**：TypeScript、定向 lint、`git diff --check`、网站生产构建通过。浏览器确认两处重复文案元素不存在，Enter 文字中心相对按钮中心误差小于 0.01px；点击仍进入空白患者表单。截图/测量证据：`test-output/home-copy-refresh/web-home.png`、`web-checks.json`。识别、记录及导出逻辑未改，沿用此前 57 项 Node / 13 项 JVM 通过结果。
- **Android 同步及构建完成**：移动端构建、Capacitor 同步、调试及正式构建通过；两种 APK 各 16 个资源与 `dist-mobile/` 及同步目录逐字节一致。证据位于 `test-output/home-copy-refresh/` 的构建日志和 `apk-verification.json`。
- **该阶段正式 APK**：`releases/GenDX_T-1.1.0-release.apk`，6,501,021 字节，SHA-256 `5f41a6fbad137980f09df5606e03ea4ea1933251f2abe4a888a5b1058e7a42cc`。v2 签名校验通过，沿用原正式证书。调试 APK 的 SHA-256 为 `973bf1d1dafc934cdae8fcb0a161b61cd652e287ca47aead26d62e1b2f8b2143`。最新产物见上方记录。
- **模拟器更新及视觉核对完成**：`Medium_Phone_API_36.1 / emulator-5554` 已同签名覆盖安装本轮 debug 包并冷启动，保持 `1.1.0 / 11`。原记录与图片共 2 文件及全部 3 个偏好文件逐字节一致，未卸载/清数据。Android Studio 画面已确认三行文案移除、Enter 居中。证据：`test-output/home-copy-refresh/emulator-after/verification.json`、`android-studio.png`。
- **验证范围**：本轮首页布局及入口操作在浏览器验证，未进行物理设备相机及真实试管识别验收；未发布远程站点。

## 1.1.0 首页图片与表单紧凑样式（2026-10-14）

- **图片完成**：使用内置 imagegen 去除用户提供图片右下角“豆包 AI 生成”水印，保存为 `public/gendx-device.png`（867×1815）。设备文字、Logo 与整体外观已目视核对；此为生成式编辑，不宣称像素级完全不变。原始用户文件未覆盖。完整提示词、来源及输出记录在 `test-output/product-refresh/image-edit.txt`。首页替换为该图，并调整展示尺寸以完整显示设备；Android 离线资源改为打包新图。
- **表单源码完成**：聚焦时直接使用蓝色边框及 1px 内描边，取消患者输入框、下拉、搜索、筛选及设置控件的外侧焦点间隙。患者框桌面 `49→46px`、移动端 `47→44px`，搜索/历史筛选/设置 select 的上下内边距合计减少 3px。操作按钮、复选框、下拉选项点击区域及业务规则保持不变。版本继续依用户要求保持 `1.1.0 / 11`。
- **源码与网页验证完成**：TypeScript、定向 lint、`git diff --check`、网站生产构建通过。浏览器实测桌面输入框 46px、移动端输入框/下拉框 44px；聚焦计算样式为蓝色边框、`outline:none`、`outline-offset:0` 和 `inset` 描边，无双框空隙。桌面/移动首页设备完整显示。未重新执行此前相同逻辑源码已通过的 57 项 Node 与 13 项 JVM 测试。证据：`test-output/product-refresh/typecheck.log`、`lint.log`、`web-build.log`、`web-checks.json`、`web-home.png`、`web-focus.png`。
- **Android 资源同步完成**：移动端构建、Capacitor 同步通过；正式/调试包各 16 个资源与 `dist-mobile/` 及 Android 同步目录逐字节一致。新图已打包，旧 `product-reference.png` 不再进入 Android APK。证据 `test-output/product-refresh/android-sync.log`、`apk-verification.json`。
- **正式 APK 构建及验签完成**：`releases/GenDX_T-1.1.0-release.apk`，6,501,113 字节，SHA-256 `b2f2ed13b47f7cec4825d4e8cb678b785713919c68ca91c79da63ab3bcf391ed`。v2 验签通过，证书 SHA-256 仍为 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9`；未生成或替换密钥。调试包 `releases/GenDX_T-1.1.0-debug.apk`，SHA-256 `deec218c12543c9d4c4199264fb8c840a765d1da8079ccf225481e2cd4a0ceac`。构建/签名/版本证据位于 `test-output/product-refresh/`。此为图片与表单样式阶段的构建，最新产物见上方记录。
- **模拟器更新完成**：`Medium_Phone_API_36.1 / emulator-5554` 已使用本轮同签名 debug APK 覆盖安装并冷启动，仍为 `1.1.0 / 11`。原记录与图片共 2 文件、3 个偏好文件的 SHA-256 全部保持一致，未卸载或清空数据。Android Studio 画面已确认新版设备图及原记录数量。证据：`test-output/product-refresh/emulator-before/`、`emulator-after/verification.json`、`android-studio.png`。
- **设备验收边界**：本轮页面交互及尺寸在浏览器验证；尚未进行物理手机、实际试管与摄像头识别验收。未发布远程站点。

## 1.1.0 下拉样式及模拟器更新（2026-10-14）

- **源码完成**：患者性别与检测项目共用 `PatientSelect`，复用已安装的 Base UI Select。箭头距右侧 16px，弹层与输入框间隔 6px，白色圆角菜单、蓝色选中标记、44px 最小选项高度，支持键盘、触摸及可用高度内滚动。保留旧版蓝色、既有业务校验和版本 `1.1.0 / 11`。
- **源码检查完成**：TypeScript、页面/新组件定向 lint、`git diff --check` 通过。识别、记录及导出逻辑未变，沿用之前通过的 57 项 Node 与 13 项 Android JVM 检查。证据 `test-output/dropdown-refresh/typecheck.log`、`lint.log`。
- **网页交互完成**：本地浏览器验证性别选值回填、全部 7 个检测项目、方向键/Enter/Escape、菜单在小屏可用空间内显示；使用临时虚构草稿确认填满表单可启用拍照、清空必填后禁用、重新进入恢复空表单。未打开相机或产生新记录。截图与检查记录：`test-output/dropdown-refresh/web-gender.png`、`web-checks.json`。
- **网页版构建与 Android 资源同步完成**：生产构建、移动端构建及 Capacitor 同步通过。正式和调试 APK 各 16 个资源均与 `dist-mobile/` 及同步目录逐字节一致。证据：`test-output/dropdown-refresh/web-build.log`、`android-sync.log`、`apk-verification.json`。未发布远程站点。
- **正式 APK 完成**：`releases/GenDX_T-1.1.0-release.apk`，4,778,630 字节，SHA-256 `e8b6e1e29e71e96563be14259457cef4c557f5b0c6599ca45107bbcd79fe2708`。版本 `1.1.0 / 11`，v2 验签通过，证书 SHA-256 仍为 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9`，未生成或替换密钥。构建及签名日志位于 `test-output/dropdown-refresh/release-build.log`、`release-signature.txt`、`release-badging.txt`。此为下拉样式阶段的交付构建，同版本最新产物见上方记录。
- **模拟器更新和启动完成**：已备份 `Medium_Phone_API_36.1 / emulator-5554` 旧应用数据及 APK，再以相同 debug 证书 `install -r` 从 `1.0.9 / 10` 覆盖到 `1.1.0 / 11`，冷启动成功。安装包 `releases/GenDX_T-1.1.0-debug.apk`，SHA-256 `5267522c8559119dcb92fd5c19abd74f7a4fc04f7e76a7a6f7539c3d311638ff`。原 1 条记录及图片共 2 文件逐字节一致，既有偏好文件均保留；未卸载或清空数据。证据：`test-output/dropdown-refresh/emulator-before/`、`emulator-after/verification.json`、`debug-build.log`。
- **设备验证范围**：通过 Android Studio 画面确认新版首页、GenDx Logo、蓝色主题及原记录数量；截图 `test-output/dropdown-refresh/android-studio.png`。CUA 原生窗口点击返回 `noWindowsAvailable`，因此本轮下拉交互实测仅在网页版完成，未宣称 Android 下拉操作或真机摄像头/真实样本已验收。

## 1.1.0 恢复旧版蓝色主题（2026-10-14）

- **源码完成**：主色恢复为 `#2855dc`，同步按钮、导航、选中状态、焦点、文字及浅色底色；保留新版布局、流程和 GenDx Logo。结果绿/红/琥珀色、灯态与待确认颜色不变。依用户本次明确要求，版本保持 `1.1.0 / versionCode 11`。
- **源码检查完成**：TypeScript 与 `git diff --check` 通过。本轮仅改主题 CSS 和说明文档，检测、记录及导出逻辑未变；沿用同一份逻辑源码已通过的 57 项 Node 和 13 项 Android JVM 回归，不重复运行。日志 `test-output/blue-theme/typecheck.log`。
- **网页版完成**：网站生产构建通过，日志 `test-output/blue-theme/web-build.log`。在现有本地预览中检查首页蓝色按钮、底部导航及设置页 `1.1.0` 文本；按钮计算背景为 `rgb(40, 85, 220)`。截图 `test-output/blue-theme/home.png` 和 `settings.png`。本次未重新执行完整相机、确认、导出端到端流程，未发布远程站点。
- **Android 资源同步完成**：移动端构建与 Capacitor 同步通过，日志 `test-output/blue-theme/android-sync.log`。16 个资源与 `dist-mobile/`、Android 同步目录及最终 APK 逐字节一致。
- **正式 APK 构建及验签完成**：`releases/GenDX_T-1.1.0-release.apk`，包名 `com.jiantu.inspection`，版本 `1.1.0 / 11`，4,751,842 字节。SHA-256：`e1187ab11eea9412f4abda60d17f9b3f201790e8e107d2a9f3b685e6cbafeba3`。v2 验签通过，证书 SHA-256 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9` 与既有正式版一致；未生成或替换密钥。证据：`test-output/blue-theme/apk-build.log`、`apk-verification.json`、`apk-signature.txt`、`apk-badging.txt`。此为蓝色主题阶段的构建；下节同版本更早构建保存在 `test-output/blue-theme/before-blue-GenDX_T-1.1.0-release.apk`。
- **设备实测未完成**：本次没有安装或操作 Android 模拟器/物理设备；网页视觉检查、资源一致性和构建成功不等于 Android 设备实测。

## 1.1.0 GenDX_T 文档流程与品牌重构（2026-10-14）

- **源码完成**：按附件 Word 的流程和页面图改为“历史 / 首页 / 我的”三入口。新增六项必填患者信息（姓名、性别、0–150 岁整数年龄、患者编号、联系方式、检测项目）；项目为 MTB、GBS、Flu A、Flu B、NG、MG、CT。每次拍照先独立录入；重新拍摄会清空表单并新建记录，原记录保留。移除文件上传、批量选图、人工改条码/改灯态、手动框选重算及删除入口。
- **只读记录完成**：患者与原图首次写入后固定，识别阶段可前进，完成后仅允许一次确认写入确认时间并锁定。历史不能修改、删除或重新确认。未确认、无条码、冲突或未知记录在历史归入待确认，导出也不会变成确认阴阳。共享存储与 Android 原生均验证状态；浏览器还校验同一事务中的旧快照，防止另一窗口覆盖已保存结果。旧存储名和包名保持不变，旧记录不补造患者信息。
- **品牌与界面完成**：使用附件 GenDx 正常版/反白版原图；正常版透明边界裁剪图用于浅色各页与弹窗，替换 favicon、Android 各密度图标及启动图标。首页使用 Word 设备示意。默认英文，可持久化切换简体中文和默认导出格式。保留结果灯互斥、无法可靠排除串光则待确认、Power 只展示的规则。
- **导出完成**：历史支持多选和全量；Excel、CSV、FHIR JSON/XML 增加患者六字段和确认时间，新增 HL7 v2.5.1 ORU R01 离线批次。患者与样本编号保留前导零，年龄不推导生日，项目及设备指示使用本地术语。FHIR 新增 Patient 与 subject，旧无患者记录不补造 Patient。未做接收方医院联调、官方完整 HL7/FHIR 认证或在线传输。
- **自动检查完成**：57 项 Node 测试通过；包含原光学回归、患者校验、确认语义、跨窗口防覆盖、不可改删、患者跨格式导出回读、HL7 字段位置/转义和文件保存失败路径。13 项 Android JVM 单元测试通过（7 项记录策略、5 项导出、1 项既有示例）。TypeScript 检查通过；页面、相机、导出与本次修改的数据模块定向 lint 通过；`git diff --check` 通过。日志：`test-output/gendx-tests.log`。
- **网页版构建完成**：最终源码网站生产构建通过，日志 `test-output/gendx-web-build.log`。使用本地预览，不发布远程站点。
- **浏览器交互实测未完成**：已准备 `test-output/gendx-ui-check.mjs`，计划覆盖 390×844/桌面布局、必填校验、模拟相机识别、确认、历史选定/全部导出及刷新持久化。首次浏览器启动被沙盒阻止（SIGABRT），提权运行随后被用户中止；最终 `test-output/gendx-ui/results.json` 为 checks=0，无验收截图，不宣称端到端通过。未再尝试绕过或重复请求授权。
- **Android 资源同步完成**：移动端 Vite 构建与 Capacitor 同步通过，日志 `test-output/gendx-android-sync.log`。明确打包品牌图、设备图、favicon、离线 barcode WASM；不打包既有闲置 OCR 模型。
- **正式 APK**：版本 `1.1.0 / 11`，目标 `releases/GenDX_T-1.1.0-release.apk` 及 `.sha256`。包名仍 `com.jiantu.inspection`，复用既有签名；签名文件缺失时打包脚本现在直接失败，不再自动生成密钥。最终正式构建通过；产物 4,752,070 字节，SHA-256：`7739b847d4246b4aa470c934e129ee72220c492d1b4536635b9962ca55d5fb6f`。v2 签名验证通过，证书 SHA-256 `36019414c7013c50ada50c0942d10e3589f2ec6fc2dddafc0719f4251a051bb9` 与 1.0.9 正式版相同。16 个打包资源与 `dist-mobile/` 和 Android 同步目录逐字节一致；Manifest 仅相机和内部 receiver 权限，无网络/麦克风/全盘存储权限。证据：`test-output/gendx-apk-build.log`、`gendx-apk-verification.json`、`gendx-signature.txt`、`gendx-apk-badging.txt`。
- **设备验证范围**：本轮没有连接物理手机。现有 Android 模拟器安装的是旧 debug 包，不能用正式包直接覆盖；现有 `emulator-5554` 为 1.0.9 / 10 调试版，签名与正式版不兼容。构建同源码 debug 包并保留数据升级验证的工具请求被标记为“用户拒绝”，因此没有构建调试包、备份、安装或改动模拟器记录；本轮 Android 模拟器运行验证未完成。正式包已单独核对签名/版本/资源。构建通过和模拟相机测试均不等于真机摄像头、实际试管、OTG/U盘或第三方分享实测。iOS 未构建交付。

## 1.0.9 Android Studio 调试包刷新（2026-10-12）

- **原因**：Android Studio 当前选中 `Medium_Phone_API_36.1`（`emulator-5554`），其中仍安装 1.0.3 / versionCode 4 调试包；此前 1.0.9 正式包安装在另一台 Pixel 模拟器。Studio 的 Run 不自动构建网页资源，日常调试步骤已补充到 README。
- **源码与正式交付**：本轮未修改应用源码。沿用已验证的 1.0.9 / versionCode 10；原正式 APK `releases/jiantu-1.0.9-release.apk` 保持不变，未新建或替换正式签名密钥。
- **资源同步与调试构建完成**：`npm run apk:debug` 完成移动端资源构建、Capacitor 同步及 Gradle Debug 构建。产物 `releases/jiantu-1.0.9-debug.apk`，SHA-256：`541e27ec29bc323f485dd5bf76b7627435e416ef4136d2b3194ca08ef8464338`。9 个移动端构建文件与 APK 逐字节一致，全部网页资源也与既有正式 APK 相同，因此未重复运行已通过的相同源码功能回归或正式构建。
- **当前模拟器升级完成**：先备份检图应用记录，再通过 `adb -s emulator-5554 install -r` 成功覆盖升级并启动。系统包信息显示 versionName 1.0.9、versionCode 10、DEBUGGABLE；没有卸载应用或清除数据。
- **界面与记录验证完成**：首页实际显示「首页、录入、拍照、我的」四个底部入口；点击「我的」后显示 1.0.9。旧的 1 条拍照记录恢复正常，升级前后的原图与 JSON 两个文件逐字节一致。
- **范围**：本轮为 Android Studio 模拟器调试包更新与启动验证，没有连接真机，未新增相机拍摄、文件导出或 OTG 验证。证据在 `test-output/1.0.9/debug-refresh-20261012/`，包括构建日志、升级前后包信息及记录备份、界面 XML 与截图。

## 1.0.9 四页底部导航与 Android 验证（2026-10-10）

- **源码完成**：网页与 Android 共用「首页、录入、拍照、我的」四页与固定底栏。首页提供概览和最近记录，录入保留选图、识别、校对及导出流程，拍照页调用已有定位框相机，我的页提供版本、当前语言、隐私和关于说明。切页共享记录与识别状态，正文为底栏和安全区域预留空间。
- **导出交付修复完成**：Android 保存等待输出流关闭后才回报成功；FHIR 分享 Intent、ClipData 与 FileProvider URI 查询保留专用 MIME。取消分享返回正常取消状态，选择接收应用不等同于该应用已完成保存或发送。
- **自动检查完成**：48 项 Node 回归通过；类型检查通过；原生流处理与 MIME 的 5 项 JUnit 检查通过，包含关闭阶段报错、目标打开失败和字节完整性。导航组件与页面定向 lint 通过；不宣称全仓库 lint 通过。
- **网页构建完成**：网站生产构建通过；本地浏览器实际切换四页，隐私弹窗打开/关闭正常，切回录入仍显示原有 6 条记录。390×844 视口下首页、拍照和我的页宽度均为 390px，无横向溢出，首页底栏位于 y=772–844。未发布远程站点。
- **Android 同步及正式构建完成**：移动端构建、Capacitor 同步和正式 Gradle 构建通过。`releases/jiantu-1.0.9-release.apk`，versionCode 10；SHA-256：`34113e703a6f2a44de83c192c08832a779862f85efc70523be2f48818c3b4cde`。签名验证通过且证书与 1.0.8 相同，未生成或替换密钥；APK 中 9 个移动端资源与 `dist-mobile/` 逐字节一致。Manifest 仅 CAMERA 与内部 receiver 权限，没有网络、麦克风或全盘存储权限。

### 本轮模拟器操作证据

Android Studio 已打开本项目 `android/` 工程。本轮**没有连接物理手机**，以下为 Pixel_9_Pro / Android 16 模拟器测试，不能当作真机验收。

| 检查 | 实际结果 |
| --- | --- |
| 旧模拟器数据保护 | Medium Phone 的 1.0.3 调试包与正式包签名不同，覆盖被 Android 拒绝；没有卸载或清数据，后续关闭该模拟器释放资源 |
| 正式升级基线 | 在另一台 Pixel 模拟器安装 1.0.7 正式包，经系统选择器导入 `test-img/a-2.jpg`；保存 1 条记录，条码 `01202609030005`、Positive 亮、Negative/Invalid/Power 未亮，显示阳性指示，无电源警告 |
| 1.0.7 → 1.0.9 覆盖升级 | `adb install -r` 成功；启动新版后首页恢复同一条记录、照片及完整条码 |
| Android 底栏 | 新版首页显示四个入口；点击「我的」显示 1.0.9、简体中文及说明入口；点击「拍照」显示拍摄指导，滚动后开启相机按钮可见，底栏保持固定 |
| 相机与导出 | 进入相机的最后一次 adb 操作被拒绝，未完成本版运行时相机授权、实时取景/拍照回传、SAF 文件保存回读、分享面板取消及接收方实测；不把源码与构建检查记作通过 |

两台模拟器同时运行期间，Pixel 模拟器宿主进程曾以 137 退出；关闭闲置模拟器并重启 Pixel 后恢复旧记录。此证据不足以归因应用崩溃，也不作为性能达标依据。

仍需连接目标手机验证相机画质、前后台释放、真实设备识别、OTG/U 盘保存和第三方接收。FHIR 官方 Validator / 接收方 HIE 联调边界继续见 1.0.8 说明。构建及浏览器截图在 `test-output/1.0.9/`，本轮 adb 原始 XML/截图在 `test-output/1.0.8/`（新版文件名前缀 `v109-`），关键证据已复制至 1.0.9 目录。

## 1.0.8 标准导出与拍摄定位框（2026-10-10）

- 正式包：`releases/jiantu-1.0.8-release.apk`，versionCode 9。SHA-256：`208b9776a9e6f51fdb81f15454fb994e3ed9a6a24680b0cafc5aa23fbba99760`。APK v2 签名验证通过，证书与 1.0.7 完全一致，可覆盖升级；没有生成或替换正式密钥。
- **源码完成**：共享 CSV / HL7 FHIR R4 JSON/XML 编码和当前保留记录统计；Android 通用保存与分享复用本地缓存、SAF 和系统分享面板。通过系统提供的可用位置选择 OTG / U 盘，不直接访问 USB 文件系统。保留 Excel 报告。
- **拍摄源码完成**：网页和 Android 共用应用内视频预览及机身/试管/条码定位参考框，保存完整视频帧；不裁框、不镜像。关闭、切换镜头和后台暂停释放视频轨道；迟到的相机请求和已取消的拍摄回调不生成记录。新增 CAMERA 权限，复用已安装 Capacitor 的运行时视频授权桥。APK Manifest 核对没有 INTERNET、麦克风或全盘存储权限。
- **自动回归完成**：45 项通过（原有 28 项、6 项相机几何、9 项标准导出、2 项文件交付）。覆盖空/处理中分母、失败与无效区分、冲突及未校对不输出确定主值、Power 亮灭/未知/缺失不影响结果与统计、条码前导零、CSV 公式防护、特殊字符和旧时间、JSON/XML 独立解析逐叶等价、四种保存 MIME/文件字节、取消与写入失败回滚。新增组件与模块定向 lint 通过；全量 lint 仍有原 `app/page.tsx` 和 `lib/native.ts` 的既有规则问题，不宣称全量 lint 通过。
- **类型与网页构建完成**：最终源码 TypeScript 检查、网页生产构建通过。本地服务地址 `http://localhost:3000/`，未发布到远程站点。浏览器实际查看 6 条已有记录的统计（6 完成、0 失败、0 无效、6 待确认），打开四种格式选择；390×844 视口下对话框宽 358px、内容无横向溢出。XML 保存操作页面返回保存成功，未取得该浏览器保存文件做再次回读，不能等同于实际 U 盘验证。
- **Android 资源同步完成**：最终移动端构建与 Capacitor 同步通过；正式 APK 内 10 个页面/识别资源与 `dist-mobile/` 逐字节一致。
- **正式 APK 构建完成**：最终 Gradle `assembleRelease` 通过；v2 签名、版本、权限与资源一致性验证证据在 `test-output/1.0.8/`。
- **FHIR 验证边界**：按官方 R4 Observation / Bundle / XML 结构实现并审查，测试独立解析 XML 且与 JSON 内容一致。另用独立生成的 19 资源样例覆盖阴阳、无效、未知、冲突、失败及处理中：lxml 解析、命名空间、资源与组件元素顺序、非空 primitive、引用解析、UUID 唯一性、本地代码定义和主值/缺失原因互斥检查通过，样例在 `test-output/fhir-validation/`。本轮官方 schema 下载受网络访问限制未完成，因此未完成官方 XSD / JSON Schema / HL7 Validator 校验或接收方 HIE 联调。本地术语定义随包提供，未编造临床代码、患者或实体设备序列号。CSV / Excel 不标为 FHIR 资源。
- **设备实测未完成**：`adb devices -l` 无连接设备；未做本版 Android 真机或模拟器安装、运行时相机授权、实际拍照回传、离线摄像头、OTG / U 盘保存或第三方分享接收。内置浏览器未提供相机画面，实际验证了 20 秒超时提示、重新开启与关闭入口，未验证有真实视频时的取景与照片质量。构建通过不能替代这些实测。

统计口径与格式说明见 README 的“标准数据导出与拍摄定位框”。使用量只代表当前保留的照片处理记录，不是设备累计检测次数；失败率是处理失败率，不是临床误判率。

## 1.0.7 b-2 机身边界（2026-09-09）

- 正式包：`releases/jiantu-1.0.7-release.apk`，versionCode 8；v2 签名验证通过，沿用既有正式证书。SHA-256：`cfb6ab15ece1d6f6e003d56cf951d06aa0fcab5ca24cb12d77cfa2f4cdcee4e2`。
- 修复机身框仍由固定比例限制而偏右、底部截短的问题。自动定位灯位后，用外壳种子颜色的连通区域、外部 RGB 边缘及跨行分位统计独立细化机身框。局部拇指遮挡不再使全部左边界内缩；边界证据不足、近黑或中性外壳与背景混淆时保留初始框。人工框选不被自动改写，既有灯态采样框不随外框扩大而移动。
- b-2 在 771×1024 分析图上的机身框由约 `(278.5, 511.1, 169.5, 420.5)` 修正为 `(254, 511, 186, 492)`，格式为 x/y/宽/高；底边覆盖完整外壳，灯态保持 Negative OFF / Positive ON / Invalid OFF。
- 28 项自动回归通过。新增 b-2 四条边与人工原图外壳标注的比较：768/1024/1536 长边、曝光 0.65/1.2 和四个直角方向共 20 个组合，框交并比均超过 0.95，每条边误差小于标注框宽度的 3.5%。该数值是对指定标注样本的几何检查，不是模型置信度。b-1/b-3/b-7 外壳边界和人工框选也通过；此前条码、灯态、串光、Power 独立性、Excel 和存储回归继续通过。
- 类型检查、网页版构建、移动端构建、Android 同步与正式 APK 构建通过；包内 10 个页面/识别资源与移动端输出逐字节一致。本地网页返回 HTTP 200。本次没有新增安卓真机、模拟器或浏览器上传交互实测；旧记录需点击“重新识别”。

## 1.0.6 新增 b 系列照片自适应（2026-09-09）

- 正式包：`releases/jiantu-1.0.6-release.apk`，versionCode 7；v2 签名验证通过，证书与既有正式版一致。SHA-256：`24c79b28b199957715f682b530664d986d4e7e9909d86f2b494b032584f81d92`。
- 逐张查看并回归 `b-1 / b-2 / b-3 / b-5 / b-7 / b-8`：原固定模板灯框偏离实际灯孔，均曾汇总为未见结果灯亮起。现以灯孔内外局部对比、成对位置与间距校正灯框，并辅助选择机身/方向；不降低原有亮灯门限，保留三结果灯互斥和 Power 仅展示。
- 6 张完整原图现均为 Negative OFF / Positive ON / Invalid OFF，条码均真实解码为 `01202609030002`。b-5 的全图扫描仍可能失败，新增全图失败后的试管区域重试；裁剪解码框还原到原扫描图坐标。主线程兼容流程与 Android/Web 共用的 Worker 均传入相同比例的管盖定位信息。
- 25 项自动回归通过：包括 6 张原图的三个结果灯框覆盖人工标注灯孔、完整条码解码；缩放至 768/1536、曝光系数 0.65/1.2、倾斜 ±5° 与 90/180/270° 旋转共 54 个变体；单独改变 Power 像素亮度的 18 个变体；合成 Negative/Invalid 亮起或全部未亮的 18 个变体。后两组是图像像素扰动测试，不是新增实拍样本。原绿色灯、串光、Excel 与持久化测试仍通过。
- 固定大小采样与运行中的排序统计替代逐像素三角计算、数组分配和排序，减少定位阶段的临时对象；没有据此宣称安卓真机速度或内存已达标。
- 类型检查、网页构建、移动端构建、Android 资源同步与 release 构建通过；APK 内 10 个页面/识别资源与移动端输出逐字节一致。本地网页已重启，`http://localhost:3000/` 返回 HTTP 200。本轮没有新增安卓真机或模拟器识别实测，也未执行浏览器上传交互实测。旧结果需点击“重新识别”。

## 1.0.5 Power 仅展示（2026-09-08）

- 正式包：`releases/jiantu-1.0.5-release.apk`，versionCode 6；v2 签名验证通过，沿用正式签名。SHA-256：`fbb0eedcdaa86ce5d083b65e546fabdd24aebe7ddc92209c86b4d2dcef72a09a`。
- Power 电源灯只保留状态展示，亮、灭、未知或缺失均不影响三结果灯的汇总、校对状态及提示。移除电源未亮警告；页面和 Excel 标明仅展示，电源状态未知显示“未识别”。旧记录重新打开即可按新规则汇总，无需重新识别。
- 16 项自动回归通过；新增三结果灯全部 27 种状态组合在不同 Power 状态/缺失时结论与校对判断不变、缺失结果灯仍待确认、Excel 不因 Power 状态产生警告或待确认的测试。原有串光、绿色灯、条码、照片与持久化回归保持通过。
- 网页实际检查已有 `a-2.jpg`：Positive 红灯亮，Power 灭，仍显示阳性指示及条码 `01202609030005`，Power 卡片标明仅展示，分析摘要无电源警告。
- 类型检查、网页构建、移动端构建、Android 资源同步和正式 APK 构建通过；10 个 APK 内页面/识别资源与移动端输出逐字节一致。本次未新增安卓真机实测。

## 1.0.4 结果灯互斥与串光（2026-09-08）

- 正式包：`releases/jiantu-1.0.4-release.apk`，versionCode 5；v2 签名验证通过，沿用正式签名可覆盖升级。SHA-256：`af71e3c3a5313bdb3899aedaeab825f3715c529b45839d7740b5f143e57d7174`。
- Negative、Positive、Invalid 联合判定：多个候选亮灯中，按灯区归一化的色差信号总量达到次强 3 倍、亮点密度达到 2 倍时保留最强者，其余标为串光；证据接近时候选灯均为待确认。Power 原状态原样保留。
- 人工校对一个结果灯为 ON 时自动关闭另两个；汇总检查三灯任意组合的冲突，不再 Invalid 优先。旧记录不自动重新分析，需点击“重新识别”。
- 14 项回归通过：包含用户截图两个灯区从双 ON 修正为 Positive ON / Negative OFF、各结果灯分别占优、信号接近、Power 独立、全图加强反光、人工互斥、原有样例与 Excel 回读。新相机照片未提供，截图回归只覆盖未遮挡灯区。
- 类型检查、网页构建、移动端构建与 Gradle release 构建通过；10 个 APK 内页面/识别资源与移动端输出逐字节一致。本次没有新增安卓设备实测。

## 1.0.3 相机拍照（2026-09-08）

- 新版正式包：`releases/jiantu-1.0.3-release.apk`，versionCode 4；沿用正式签名，签名验证通过。SHA-256：`909279971dc97c708bbb64852514d4ca8565fb84f26d96d24f16c39407b5ac5c`。
- 网页增加相机预览、切换镜头、拍照并识别和取消；关闭时停止媒体轨道；无设备、权限拒绝、设备占用与 20 秒启动超时提供提示。照片按视频实际分辨率生成 JPEG 后进入现有识别/保存队列。
- Android 增加 `takePhoto` / `photoCaptured` 原生回调，用系统相机、`EXTRA_OUTPUT` 和仅覆盖 imports 缓存的 FileProvider URI 接收完整 JPEG。取消删除临时空文件，拍摄成功后读取文件并复用识别及本地保存流程，不读取相机返回缩略图。
- `npm test` 10 项回归通过，类型检查、网站构建、Android 资源同步、release/debug 构建通过。最终正式包内 10 个网页/识别资源与移动端输出逐字节一致。
- 浏览器实际确认拍照入口和预览弹窗；测试后已回到页面，原有 2 条记录保持。内置浏览器未提供摄像头画面，本轮未实际采集电脑摄像头照片。
- 同签名调试包已覆盖安装 emulator-5554 成功；模拟器的原生窗口交互多次返回 noWindowsAvailable，未完成系统相机拍摄回传验证。没有连接安卓真机，不能宣称完整拍照流程或实际照片质量已经设备实测通过。
- 依据：[Android 相机 Intent](https://developer.android.com/guide/components/intents-common#Camera)、[浏览器摄像头接口](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

## 1.0.2 网页与 Android 同步修复（2026-09-08）

- 正式包：`releases/jiantu-1.0.2-release.apk`，versionCode 3。同步上传主图清晰度、Worker 加载及兼容模式、旧失败记录预览恢复，包含 1.0.1 绿色灯修复。
- SHA-256：`0c096b162a78a12f8ec4610760bda8cf8b1bd33a173dec9568177b82f2829828`。
- `npm run apk:release` 完成移动端构建、Capacitor 资源同步和 Gradle 正式构建。APK v2 签名验证通过，证书与 1.0.0 / 1.0.1 一致，可覆盖升级。
- 解包逐字节核对：10 个移动端构建文件全部与 APK 内 `assets/public/` 对应资源一致。
- 共用源码在上一轮已通过 10 项回归、类型检查、网页构建及网页中实际 a-1 原图重新识别，本轮未改动识别源码；本次没有新增 Android 设备运行或性能实测。
- 用户的后续双端同步要求已写入项目 `AGENTS.md`；APK 文件名从 Android `versionName` 自动生成，避免两处版本号不同步。

## 1.0.1 绿色灯漏检修复（2026-09-08）

- 新包：`releases/jiantu-1.0.1-release.apk`，versionCode 2，APK v2 签名验证通过。
- SHA-256：`3f44911e4a2f611f8a3f36266971eb7a80a66fbfd30a5c438d7badb70ee999e0`。
- 调整绿色发光区域的饱和度与亮度门限，要求连续区域和至少 4 个高亮核心像素，防止零散绿点累积为 ON。
- 用户截图中未被遮挡的 Negative 灯区：修改前 15 个合格像素 / OFF，修改后 56 个合格像素 / ON / green。完整原图未提供，本项仅验证灯区分类。
- `npm test` 10 项全部通过，包含灯区缩放、压暗、JPEG 压缩、白色/青色反光、暗绿色、散点噪声与原有两张完整样例；类型检查、网站构建、移动端构建、Gradle release 构建通过。
- 沿用正式签名，旧记录不自动重算；覆盖升级后点击“重新识别”。本次未重测安卓设备运行、速度和内存；下文设备测试数据仅适用于 1.0.0。

## 1.0.0 交付版本与设备验收

- 正式安装包：`releases/jiantu-1.0.0-release.apk`，约 3.8 MiB。
- 包名 `com.jiantu.inspection`，版本 1.0.0 / versionCode 1，最低 API 24，目标 API 36。
- APK v2 签名验证通过；SHA-256：`5ab57da675c79dd658aa7e7bbe1d615254e4d99d94d3704d8fcfeb57877407c9`。
- 页面、工作线程、ZXing WASM 均随 APK 打包。合并后的 Manifest 没有 INTERNET、READ/WRITE_EXTERNAL_STORAGE 或 READ_MEDIA_IMAGES 权限。
- 原生选图与保存使用 Android Storage Access Framework；分享使用系统分享面板和只读文件 URI。实现依据：[Android 文件访问文档](https://developer.android.com/training/data-storage/shared/documents-files)、[Capacitor Android 插件文档](https://capacitorjs.com/docs/plugins/android)。

## 测试环境与范围

实际运行的是安卓模拟器，**没有连接安卓真机，以下数字不能代表真实手机速度**。

- AVD：Medium_Phone_API_36.1，ARM64，Android 16 / API 36.1。
- 物理屏幕 1080 × 2400，WebView 视口 411 CSS px；浅色布局无横向溢出。
- 系统可见总内存约 1.93 GiB；Android System WebView 134.0.6998.135。
- 从安装正式包前就开启飞行模式，关闭 Wi-Fi 和移动数据；安装后首次运行直接识别原图，没有先联网下载模型。
- 输入：`test-img/a-1.jpg`（2,157,507 字节）和 `a-2.jpg`（2,294,579 字节），均为 3072 × 4096。

## 已执行的检查

| 检查 | 实际结果 |
| --- | --- |
| 正式 APK 签名及安装 | 通过；卸载本次调试应用后安装正式包，正常冷启动 |
| 断网首次运行 | 通过；界面和识别资源从安装包加载 |
| 安卓系统选图 | 通过；系统选择器长按多选两张原图，不申请相册全量权限 |
| 识别及定位 | 两张条码与四路灯态符合下表；展示照片、机身、条码和灯位框 |
| Excel 保存 | 正式包经系统保存对话框写入 Download，页面收到保存成功回调 |
| Excel 文件内容 | 将实际安卓导出文件拉回电脑重新读取：2 张嵌入照片、2 条汇总、8 条灯态明细，条码前导零保留 |
| Excel 分享 | 正式签名包与调试包均实际打开系统分享面板，显示一个 `.xlsx` 附件和系统可用接收应用；取消返回，未向联系人发送文件 |
| 退出恢复 | 正式包强制停止再冷启动，恢复 2 条记录、照片预览和完整条码；调试包覆盖安装后也保留记录 |
| 自动回归 | 8 项通过：真实样例、旋转、缩放/曝光、异常规则、Excel 回读、1536 px 扫描、本地保存/恢复/校对/删除 |
| 构建检查 | TypeScript、网页构建、独立移动端构建、Android Debug 和签名 Release 均通过 |

正式 APK 的实际 Excel 回读结果：

| 图片 | 条码 | Negative | Positive | Invalid | Power | 识别耗时 |
| --- | --- | --- | --- | --- | --- | --- |
| a-1 | 01202609030006 | 未见亮起 | 未见亮起 | 黄/橙色亮起 | 未见亮起 | 18,719 ms |
| a-2 | 01202609030005 | 未见亮起 | 红色亮起 | 未见亮起 | 未见亮起 | 19,573 ms |

耗时是应用实际记录的“读取原图 → 定位/灯态/条码 → 预览生成”，不含用户选图时间与最终落盘时间。模拟器上单张约 19 秒，速度仍需在目标手机上评估，未达到或承诺任何真机速度指标。Power 未确认亮起的提示在页面与 Excel 中均保留。

## 内存与处理方式

正式包于 00:00:16–00:02:15 采样约 119 秒，共 100 次，覆盖选图、两张识别以及导出开始。使用 `dumpsys meminfo`，合计应用主进程和**与该应用绑定的** WebView 渲染进程 PSS，不包含其他应用的 WebView。

- 观察到的 PSS 峰值：264.3 MiB。
- 采样开始：98.4 MiB；采样结束：210.8 MiB。
- 这是采样观察峰值，不能保证捕获瞬时绝对峰值；采样间隔会受 adb 执行耗时影响。
- 识别使用独立工作线程，避免大图计算阻塞界面；每张关闭 ImageBitmap 和释放画布。小尺寸解码器在批次间复用；全尺寸回退或异常后终止线程释放较大解码堆。优先按 1536 px 扫描，失败再使用 2560 / 4096 px。

可在连接目标手机后复测：

```sh
adb devices -l
adb -s <设备序列号> install -r releases/jiantu-1.0.0-release.apk
python3 scripts/android-memory.py --serial <设备序列号> --seconds 120 --output test-output/android/phone-memory.json
```

采样时在手机中选择同样照片，导出 Excel 读取耗时；再强制停止并打开应用检查恢复。测试原图只用于测试，不会预置到 APK 或硬编码到识别逻辑。

## 尚未验证

- 安卓真机、不同厂商系统、最低 Android 7.0 版本、连续 30 张长批次、存储空间耗尽场景。
- 具体微信等接收应用的附件接收和打开（模拟器未配置这些账号/应用）。
- 自动化单测覆盖处理中断后的恢复状态；设备端强制停止测试是在结果已保存后进行。
- APK 安装后数据保存在应用私有目录，卸载或清除数据会删除记录。Excel 包含缩略图与结果，不能重新导入还原完整原图档案。

详细证据保存在忽略目录 `test-output/android/`：`release-validation.json`、`release-memory.json`、`release-results.xml`、`release-restored.xml`、截图、实际导出工作簿及签名检查结果。
