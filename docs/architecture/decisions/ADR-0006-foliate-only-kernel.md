# ADR-0006 · foliate-js 是唯一渲染内核

- 状态:Accepted(2026-09-09,用户强制要求)
- 背景:用户指令:"电子书渲染内核(唯一强制):完整集成 foliate-js 作为唯一渲染引擎,全权处理 EPUB、MOBI、AZW3、FB2、CBZ、TXT、MD、PDF、CHM 全格式解析、分页、滚动、CFI 精准进度定位、章节解析、批注锚点,保留原版书籍精美排版,不做强制文本转译。"
- 决策:
  1. `packages/reader-adapter`(`@reader/reader-adapter`)是唯一允许 import foliate-js 的包;业务层只依赖 `@reader/reader-core` 的 `ReaderEngine` 契约。
  2. 格式矩阵(2026-09-09 实测):
     | 格式        | 支持方式                                              | 验证                                      |
     | ----------- | ----------------------------------------------------- | ----------------------------------------- |
     | EPUB        | 内核原生(epub.js)                                     | 浏览器 E2E:渲染/翻页/目录/CFI/选区/划线 ✓ |
     | MOBI / AZW3 | 内核原生(mobi.js)                                     | 内核声明支持;样书回归待补                 |
     | FB2         | 内核原生(fb2.js)                                      | fixture 已建                              |
     | CBZ         | 内核原生(comic-book.js)                               | 内核声明支持                              |
     | PDF         | 内核官方 pdf 适配器(vendored)+ pdfjs-dist 6           | 浏览器 E2E:固定布局 + 文本层 ✓            |
     | TXT         | 适配器实现内核 book 接口(段落转义包裹,**不改写文本**) | 单测 ✓                                    |
     | MD          | marked 渲染为 HTML(**渲染即格式本义**,非转译)         | 单测 ✓                                    |
     | CHM         | **不支持**,返回 `BOOK_UNSUPPORTED_FORMAT`,UI 如实提示 | 单测 ✓                                    |
  3. TXT/MD/CHM 是内核能力边界(内核 README 明确未提供):前两者经适配器补齐,CHM 不伪造支持(spec §7/§65)。
  4. 保留原版排版:主题只注入 `html/body` 背景/前景与根字号,不重排书籍文本;PDF/CBZ 固定布局完全保留原样(PDF 夜间模式按 spec §27 另行设计,不做整体反色伪装)。
- 事实记录(实现时确认的内核契约, ambient 类型声明锁定于 `src/foliate-js.d.ts`):
  - `paginator.open(book)` 只注册章节,**初始显示必须显式导航**;适配器在 `open()` 末尾调用 `view.goToTextStart()`。
  - Tauri 事件名禁止 `.`,逻辑名到传输名的映射沿用 ADR-0003;内核通过 closed Shadow DOM + blob iframe 渲染,CSP 需要 `frame-src blob:` 与 `style-src 'unsafe-inline'`(注入书籍样式)。
  - npm 包 `foliate-js@1.0.1`(官方,MIT)未捆绑 pdf.js 适配器,故按其源码 vendored 至 `src/books/vendor/`(改动点在文件头注明);pdfjs-dist 的 cmaps/standard_fonts 由 `pnpm fixtures` 复制到应用 `public/pdfjs/`。
- 后果:换内核 = 重写 adapter 单包;`known issue`:少于整页的极短章节打开时进度分数可能显示偏高(kernel SectionProgress 对单页 section 的取值),留待 polish。
