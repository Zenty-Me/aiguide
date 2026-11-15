# 自托管字体与许可

本站只在本地托管两个拉丁字体文件。下表的事实**全部取自文件本身的 `name` 表与字节内容**（`fontTools` 4.51.0，`D:/Anaconda/python.exe`，2026-11-14 读取），不是从文件名推断的。

| 文件 | 字节 | SHA-256 | 内部族名 / 版本 | 内部版权行（照录） | 字形数 |
| --- | --- | --- | --- | --- | --- |
| `host-grotesk-latin.woff2` | 20296 | `ce9c9db8a488852eb7e4a52f51fd8ce0c93ef61a8d3bfa054b509ec92958dcfe` | `Host Grotesk Light` / `Version 1.003`（`1.003;LMNT;HostGrotesk-Light`） | `Copyright 2023 The Host Grotesk Project Authors (https://github.com/Element-Type/HostGrotesk)` | 247 |
| `jetbrains-mono-latin.woff2` | 31432 | `83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be` | `JetBrains Mono` / `Version 2.211`（`2.211;JB;JetBrainsMono-Regular`） | `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)` | 394 |

两个文件都是 `wOF2` 容器、TrueType 轮廓、含 `fvar`/`gvar`/`HVAR`（可变字体轴）；`name` 表 ID 14（License URL）分别为 `https://openfontlicense.org` 与 `https://scripts.sil.org/OFL`，ID 13（License Description）为空。

## 上游与许可全文

| 字体族 | 上游项目 | 随附许可全文 |
| --- | --- | --- |
| Host Grotesk | https://github.com/Element-Type/HostGrotesk ，Google Fonts 目录 `ofl/hostgrotesk` | `licenses/host-grotesk-OFL.txt` |
| JetBrains Mono | https://github.com/JetBrains/JetBrainsMono ，Google Fonts 目录 `ofl/jetbrainsmono` | `licenses/jetbrains-mono-OFL.txt` |

许可全文在 2026-11-14 取自 Google Fonts 官方仓库
`https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/OFL.txt`，未改写内容；两份文件的版权行与上表 `name` 表里的版权行一致。OFL 1.1 要求随分发附带版权声明与许可全文，本目录同时提供两者。

## 使用方式

- 自托管：`@font-face` 在 `src/styles/global.css` 顶部声明，`font-display: swap`，只覆盖 `latin` 范围。
- 中文不依赖这两个文件，落到系统 sans 栈（PingFang SC、Microsoft YaHei、Noto Sans SC 等）。

## 来源：未保留记录，无法确认

- **只能确认的**：文件是合法 `wOF2` 字体（`file` 识别为 `Web Open Font Format (Version 2), TrueType`，且 `fontTools` 可正常解析全部表）；内部族名、版本与版权行与上游项目自述一致；随附的 OFL 全文与官方仓库一致。
- **无法确认的**：这两个 woff2 的生成路径。项目没有保留下载或子集化时的命令、时间、源文件哈希，字体内部也不记录这类信息。因此不声称它们「由官方 URL 直接下载」、也不声称「在本地子集化产生」——两种说法都没有证据。
- **同样不做的结论**：不声称文件「未修改字形」「未更名」「符合 OFL 对嵌入与再分发的要求」。字形是否被改动无法从 woff2 反推上游原文件来证明；是否触发 OFL 的 Reserved Font Name 条款取决于是否改名，而文件内部族名仍是 `Host Grotesk Light` / `JetBrains Mono`，这一点只说明未改族名，不构成合规结论。
- 如需完全可复现：从上述上游仓库取原始 TTF/OTF，用同一子集工具重新生成，并记录命令、工具版本与前后 SHA-256。