# 检图 · 设备灯态检测

源代码项目：`inspection-tool`。提供网页版与独立离线 Android APK，不需要后端或部署服务器，保持浅色界面。按样例中的蓝盖四灯设备布局分析灯态，并从真实条码图案解码。

详细技术说明：[技术架构、技术方案与实现说明](TECHNICAL-ARCHITECTURE.md)，包含双端架构、图像识别算法、本地存储、原生桥接、Excel、构建与验证范围。

学习识别原理：[核心识别与数据处理教程](CORE-RECOGNITION-TUTORIAL.md)，从 RGB 像素到机身、灯孔、亮灭、串光与条码逐步推导，包含公式、b-2 实测数据、坐标转换和可运行实验。

版本更新、构建检查与设备实测状态统一见 [版本与 Android 验收记录](ANDROID-VALIDATION.md)。

## 导航

网页与 Android 使用同一套浅色页面，底部固定四个入口：

| 页面 | 用途 |
| --- | --- |
| 首页 | 查看本地记录数、待校对数、分析失败数和最近三条记录；可进入录入、现场拍照或全部本地记录 |
| 录入 | 选择照片、识别条码与灯态、切换本地照片、查看定位图层、重新识别、手动框选、校对保存、移除记录和导出数据 |
| 拍照 | 查看完整机身与试管条码的拍摄示意，再点击“开启相机”进入带定位框的实时预览；也可选择已有照片 |
| 我的 | 查看当前版本、语言“简体中文”，打开“隐私说明”与“关于检图”弹窗 |

四页共享同一份本地记录、当前照片和分析状态。分析中可切换页面，后台处理继续，重复选图、拍照和导出入口会暂时禁用；接收照片成功后进入录入页查看进度与结果。取消拍照留在拍照页，不新增记录。首页的历史入口打开录入页的本地记录，不增加第五个 Tab。

底栏适配移动端安全区域，正文预留底部空间，避免最后一项内容被遮住。当前只提供简体中文，“语言”展示实际配置，不提供未实现的多语言切换。隐私说明列明本机处理与保存、用户主动保存或分享的行为以及清除数据的影响；关于页说明版本、设备适配范围、结果灯规则和标准导出范围。

## 当前流程

1. 从首页点击“开始录入”，在录入页批量选择 JPG / PNG / WebP；或进入“拍照”页点击“开启相机”，将完整机身和试管放入定位框后拍摄。单张不超过 20 MB，最多保留 30 张。
2. 从蓝色管盖与机身边界定位样例型号设备，自动尝试 0 / 90 / 180 / 270 度方向。
3. 独立工作线程逐张识别，完成后关闭原图位图、释放画布，复用小尺寸解码器；全尺寸回退或异常后回收工作线程；条码先按 1536 像素长边扫描，失败再提高到 2560 / 4096 像素。ZXing-C++ WebAssembly 从真实条码图案解码，保留前导零；多条码或解码失败时要求人工确认，不用 OCR 猜测号码。
4. 从设备布局得到灯位初始区域，再用灯孔与周围外壳的局部对比、成对灯孔间距和排列校正位置，适应距离、曝光与轻微倾斜变化；测量亮度、色差信号及高亮面积，区分亮灯和小面积反光。Power 仅展示。
5. 在录入页查看机身、条码、四灯定位框，可切换照片和图层、重新识别、手动框选机身；结果区展示四路灯态、颜色、综合指示、处理耗时和实际测量依据。对照原图点击“校对并保存”，条码与灯态校对结果保存到本机。
6. 点击“导出数据”，选择 FHIR XML、FHIR JSON、CSV 或 Excel。FHIR / CSV 包含当前保留记录的统计、灯态与校对状态；Excel 保留照片缩略图与逐灯测量明细。

这是本地光学规则与特定设备布局模板，未提供或训练 YOLO 模型，不展示伪造的模型置信度、SNR 或固定耗时。模型名称、置信度和 Power 状态不会从参考图复制到结果中。

## 判定规则与限制

- Negative、Positive、Invalid 三个结果灯互斥，只有这三个灯参与结果分析。
- 多个结果灯位超过亮灯门限时，比较按灯区面积归一化的发光面积与色差信号。最强信号至少为次强的 3 倍且亮点密度至少为 2 倍时保留主灯，其他标为串光；否则候选灯态均为待确认，不强行选一个。
- 旧记录若有任意两个结果灯同时 ON，汇总显示冲突待确认；不再按 Invalid 优先。请点击“重新识别”。人工校对一个结果灯为 ON 时自动将另两个设为 OFF。
- Positive 单独亮起：汇总为“阳性指示”；Negative 单独亮起：汇总为“阴性指示”。
- 结果灯位未定位、结果灯态未知或没有结果灯亮起：待确认。
- Power 是电源灯，仅展示状态；亮、灭、未知或缺失均不影响检测结果和校对状态，不产生核对警告。页面与 Excel 标明“仅展示”。
- 仅适配样例中的蓝盖四灯读数设备。其他型号、严重透视、遮挡或强反光需要更多标注样本、型号模板或训练模型；定位不对时请手动框选或校对。
- 当前只分析图片中的设备指示，不推导病种、疾病诊断或治疗建议。
- Android 原图与结果保存在应用私有目录，每条记录使用原子写入；完成保存后退出、强制停止和重启会恢复。处理中退出的照片会标记为中断，可重新分析。浏览器使用 IndexedDB。
- 卸载应用、清除应用数据会删除本地记录；提前导出 Excel。Excel 包含照片缩略图和检测数据，不是用于重新导入原图的完整备份。

## Android APK

构建环境：Node.js 22.13+、JDK 21、Android SDK 36。首次构建需联网下载依赖；安装后的应用无需联网，Manifest 不申请网络或全盘存储权限。

```sh
npm ci
npm run apk:release
```

当前产物：`releases/jiantu-1.0.9-release.apk` 与同名 SHA-256 校验文件（versionName 1.0.9，versionCode 10）。将 APK 复制到安卓手机，允许对应文件管理器安装未知来源应用后安装。支持 Android 7.0 / API 24 及以上，需要系统 WebView 能运行 WebAssembly。仅在主动开启相机时请求相机权限。

`JAVA_HOME`、`ANDROID_HOME` 可按本机路径设置；脚本默认使用 macOS Android Studio 自带 JDK 和用户目录下的 Android SDK。`npm run apk:debug` 生成可调试测试包。调试包与正式包签名不同，不能互相覆盖安装；升级正式包要保留原签名。

首次正式构建自动生成 `signing/jiantu.jks` 与本地密码文件，这个目录已忽略 Git。请将整个 `signing/` 目录安全备份；后续升级必须使用同一密钥，并在 `android/app/build.gradle` 增加 `versionCode`。签名私钥和密码不随 APK 分发。

### 在 Android Studio / 模拟器中打开

在项目根目录运行以下命令，可在 Android Studio 中打开原生工程：

```sh
npx cap open android
```

本机 macOS 已有 `Pixel_9_Pro` 模拟器。若尚未启动，可在终端运行下面的命令，等到 Android 桌面出现：

```sh
"$HOME/Library/Android/sdk/emulator/emulator" -avd Pixel_9_Pro
```

保持该终端运行，在另一个终端的项目根目录安装正式 APK 并打开应用（仅启动一台模拟器时）：

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" -e install -r releases/jiantu-1.0.9-release.apk
"$HOME/Library/Android/sdk/platform-tools/adb" -e shell am start -n com.jiantu.inspection/.MainActivity
```

已安装时只需最后一条命令。`-r` 使用同签名包覆盖升级并保留记录；若提示签名不一致，请使用同签名包或另一台模拟器，不要为运行正式包卸载已有记录的调试应用。

若同时运行多台模拟器，先查看设备列表，再将命令中的 `-e` 换成 `-s 实际序列号`：

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" devices -l
```

修改源码后先运行 `npm run apk:release`，再安装新的正式 APK。离线 APK 不依赖 `npm run dev` 或本地网页服务器。

### Android Studio 调试

Android Studio 的 Run 只编译原生工程，不会自动重新构建网页资源。修改网页源码后，在项目根目录先运行 `npm run android:sync`，再在 Studio 选择目标模拟器并点击 Run。

也可以一次完成资源同步和调试包构建，再覆盖安装到当前模拟器：

```sh
npm run apk:debug
"$HOME/Library/Android/sdk/platform-tools/adb" -e install -r releases/jiantu-1.0.9-debug.apk
"$HOME/Library/Android/sdk/platform-tools/adb" -e shell am start -n com.jiantu.inspection/.MainActivity
```

已有调试版的模拟器使用调试包覆盖；已有正式版的设备使用正式包覆盖。两者签名不同，不混装；多台模拟器同时运行时，用 `-s 实际序列号` 指定目标。

### 应用操作

1. 从首页进入“录入”并点击“选择照片”，使用安卓系统文件/照片选择器，可长按多选；现场采集可从底部“拍照”页开启相机。
2. 每张原图先保存到本机，再识别和保存结果；可切换照片、重试、框选、人工校对。
3. “导出数据”选择格式后，“保存文件”打开系统保存位置选择器，可保存到下载目录或已挂载且由文件提供程序暴露的 OTG / U 盘。手机不支持该位置时先保存到本机，再用文件管理器复制。
4. “分享文件”打开系统分享面板，选择已安装接收应用；只有选择分享时文件才交给接收应用。关闭面板会提示“已取消分享”；选中接收应用仅表示已交给所选应用，不等于该应用已保存或发送成功。
5. 本地记录最多 30 张；删除照片也会删除对应本地原图与结果。切换四个页面不会删除记录，首页可查看最近记录，“我的”可查看隐私与应用说明。

安卓原生桥接在 `android/app/src/main/java/com/jiantu/inspection/InspectionNativePlugin.java`，本地记录逻辑在 `lib/record-store.ts`，安卓导出在 `lib/mobile-export.ts`。`vite.mobile.config.ts` 将界面、条码 WASM 打包到 APK，未打包既有闲置 OCR 模型，不加载线上网站。

## 标准数据导出与拍摄定位框

### 格式与互操作性范围

- **FHIR XML / JSON**：使用 HL7 FHIR R4（4.0.1）`Bundle(type=collection)`，包含本地 `CodeSystem`、代表照片处理软件的 `Device`、按已有试管条码关联的 `Specimen`、逐条灯态 `Observation` 和汇总统计 `Observation`。使用 `application/fhir+xml` / `application/fhir+json`。未采集患者、检验项目、实体检测仪序列号或样本采集时间，不杜撰这些值或 LOINC / SNOMED 编码。
- 主结果仅在处理完成、人工校对完成且无待确认原因时输出。处理失败、处理中、缺条码、灯态冲突或未校对记录用 `dataAbsentReason` 和状态组件表达；原始灯态仍可追溯。Invalid 不作为有效阴性或阳性。Power 始终仅展示。
- 本地术语标识为 `urn:inspection-tool:codes:v1`，定义随包提供。接入具体 HIE / 医院系统仍需按接收方实施指南补充患者和检验项目等信息、映射术语并完成系统联调；本实现不宣称通过特定地区 HIE 认证或 HL7 v2 接口认证。
- **CSV**：UTF-8 BOM、统一列结构，包含 `metadata`、`summary`、`inspection` 三类行；CSV 不是 FHIR 资源。条码、记录 ID 以及可能被表格软件执行或改写的文本前置英文撇号保护。程序导入这些文本字段时移除保护前缀，FHIR 中始终保留原字符串。用 `export_result` 读取导出状态，`raw_result` 仅作原始灯态追溯。
- **Excel**：继续提供原有含缩略图的人工查看报告，不当作 FHIR 交换文件。所有格式均离线生成；文件只在用户选择保存或分享时离开应用私有存储。浏览器支持文件保存接口时可直接选 U 盘，否则下载后复制。
- 有 Unix 时间戳的旧记录导出带时区的记录创建时间；没有时区的历史时间文本保留原文，不猜测为临床检测或采样时间。XML 无法表达的控制字符会提示改用 JSON 或修正字段。
- **文件保存与分享**：Android 分享 Intent、ClipData 及接收应用查询的文件 URI 均保留 `application/fhir+xml` / `application/fhir+json`，避免 FHIR 文件退化为普通 XML / JSON 类型。Android 保存等待复制、刷新和输入/输出流关闭全部完成后才返回成功，文件提供程序在关闭阶段报告的失败仍会传回页面。网页保存同样等待写入与 `close()` 完成；没有文件保存接口时仅提示已发起下载，不宣称已写入指定位置。用户取消保存或分享会收到正常取消提示，原记录保留。

### 统计口径

统计仅覆盖**本次导出的当前保留记录**（最多 30 条）。一条记录代表一次照片处理，无法表示实体设备累计使用次数；删除或重新分析会改变统计，不是不可变审计日志。

| 指标            | 口径                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| 处理完成        | `phase=done`，不等同于人工校对完成                                                      |
| 处理失败率      | `phase=error` 数量 ÷ (`done` + `error`)；处理中不进分母，无分母显示未知；不是临床误判率 |
| 无效指示次数    | 处理完成且三个结果灯明确得到 Invalid；冲突不算 Invalid                                  |
| 待确认记录      | 处理完成且需要人工校对；失败与处理中另计；可与无效指示重叠                              |
| 阴性 / 阳性数量 | 已校对且无待确认原因的明确设备指示                                                      |
| 平均处理耗时    | 已结束记录中保存的有效非负耗时均值，单位 ms                                             |

### 拍摄与平台行为

网页和 Android 共用 `CameraDialog`：摄像头画面保持完整比例，框包含试管/条码和机身/灯位参考；框是对齐辅助，不检测是否已对准、不裁剪照片、不保证识别准确率。JPEG 分辨率取实际视频流尺寸（请求 2560×1920，由摄像头和 WebView 决定），不等同于系统相机最高静态拍照分辨率。

Android 使用 APK 内的安全本地页面及 Capacitor 现有视频权限桥；无网络请求和麦克风权限。拒权、相机占用、无设备、超时可重试或关闭后选择照片；切换镜头、关闭和进入后台会释放视频轨道，返回前台后需主动重新开启。网页版需 HTTPS 或 localhost。

标准依据：[FHIR R4 Observation](https://hl7.org/fhir/R4/observation.html)、[Bundle](https://hl7.org/fhir/R4/bundle.html)、[XML](https://hl7.org/fhir/R4/xml.html)、[JSON](https://hl7.org/fhir/R4/json.html)、[Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)、[Capacitor 本地页面配置](https://capacitorjs.com/docs/config)。

## 本地网页开发

Node.js 22.13+：

```sh
npm install
npm run dev
```

访问终端显示的本地地址。页面、识别代码和条码 WASM 均从本项目加载，不调用云端识别 API。既有中文 OCR 资源保留在源码中，但新版灯态分析不加载它们。

## 自动验证

用户提供的四张参考图片保留在 `test-img/`，其中 `a-1.jpg`、`a-2.jpg` 用作回归输入。

```sh
npm test
npm run typecheck
npm run build
```

测试覆盖旋转、分辨率变化、适度减暗、空白图、三结果灯互斥和 Power 独立性，以及 Excel 回读、FHIR JSON/XML 等价、CSV 文本保护、统计口径、文件保存/取消/失败及相机框几何。测试产物在忽略目录 `test-output/`。没有将样例文件名或号码写入生产识别逻辑。

各版本检查结果与安卓实测范围见 [版本与 Android 验收记录](ANDROID-VALIDATION.md)。可选只读 WebMCP 接口未在支持该协议的浏览器环境验证。

主要源码：`app/page.tsx`（四页共享状态与录入流程）、`components/inspection/app-navigation.tsx`（底部导航、首页、拍照指导与我的）、`components/inspection/camera-dialog.tsx`（实时拍摄与定位框）、`lib/device-vision.ts`（定位与光学分析）、`lib/barcode.ts`（条码解码）、`lib/inspection.ts`（汇总规则）、`lib/recognition.ts`（浏览器处理流程）、`lib/export.ts`（Excel）、`components/inspection/analysis-image.tsx`（定位标注）。
