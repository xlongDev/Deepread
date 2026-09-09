# 全平台 AI 电子书阅读器

# 工程实施版

> **这是一个 Engineering Specification，而不是普通需求文档。**
>
> 你必须按照本文档定义的架构、Protocol、Domain Model、状态机、测试策略、Sprint、Definition of Done 执行。
>
> 不允许为了“快速完成”而降低工程质量。
>
> 不允许用 Mock、假 API、假进度、假同步、伪 AI、伪解析器冒充真实实现。
>
> 如果某项能力受底层技术限制，必须明确说明，而不是伪造成功。

---

# 0. EXECUTIVE DIRECTIVE

你现在负责从 0 到 1 开发一款：

> **下一代跨平台 AI 电子书阅读器**

产品定位：

```text
Professional Ebook Reader
        +
AI Reading Assistant
        +
AI Book Processing
        +
Knowledge System
        +
Learning System
        +
TTS / Audiobook
        +
Cloud Sync
```

核心技术：

```text
Tauri 2
Rust
React
TypeScript
Vite
foliate-js
SQLite
AI Provider Architecture
RAG
Local AI
Cloud AI
TTS
```

目标平台：

```text
macOS
Windows
Linux
Android
iOS
```

核心设计理念：

```text
Reader First
AI Enhanced
Local First
Privacy First
Performance First
Architecture First
Type Safe
Cross Platform
```

---

# 1. NON-NEGOTIABLE RULES

以下规则具有最高优先级。

## 1.1 Reader First

阅读器必须永远优先于 AI。

任何 AI 功能不得：

- 阻塞阅读
- 阻塞翻页
- 阻塞滚动
- 阻塞 UI
- 影响阅读进度
- 修改原始书籍

---

# 1.2 Original Content Is Immutable

原始电子书永远不能被 AI 直接覆盖。

必须采用：

```text
Original
   ↓
Processing
   ↓
Candidate Version
   ↓
Diff Review
   ↓
Approved Version
```

支持：

```text
Accept
Reject
Edit
Rollback
Restore
```

---

# 1.3 No Fake Implementation

禁止：

```text
TODO
Coming Soon
Fake API
Fake AI
Fake Sync
Fake TTS
Fake Parser
Fake Progress
Fake Database
Hard-coded demo data
```

如果当前 Sprint 明确允许 Stub：

必须：

```text
标记为 Stub
隔离在明确模块
不能影响正式架构
不能冒充完成
```

---

# 1.4 Architecture Before Features

任何功能必须先回答：

```text
属于哪个 Domain？
属于哪个 Layer？
依赖什么 Protocol？
使用什么 Repository？
产生什么 Event？
如何测试？
如何恢复？
```

不能直接在 UI 中堆功能。

---

# 1.5 Type Safety

禁止：

```ts
any
```

禁止：

```ts
@ts-ignore
@ts-expect-error
```

禁止通过关闭 TypeScript / ESLint 检查解决问题。

如果确实存在特殊情况：

必须：

1. 局部隔离
2. 注释原因
3. 添加测试
4. 后续技术债记录

---

# 2. SYSTEM ARCHITECTURE

整体采用：

```text
┌────────────────────────────────────────────┐
│                  UI Layer                  │
│ React / Components / Screens / Animation   │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────┐
│              Application Layer             │
│ UseCases / Commands / Orchestration        │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────┐
│                 Domain Layer               │
│ Book / Reader / AI / Notes / Sync / User   │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────┐
│              Infrastructure Layer          │
│ Storage / Network / Tauri / AI / OS / FS   │
└─────────────────────┬──────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
       Rust Core              External
                              Providers
```

核心原则：

```text
UI
↓
Application
↓
Domain
↓
Infrastructure
```

禁止反向依赖。

---

# 3. MONOREPO STRUCTURE

推荐最终结构：

```text
/
├── apps/
│   ├── desktop/
│   └── mobile/
│
├── packages/
│   ├── ui/
│   ├── design-system/
│   ├── reader-core/
│   ├── reader-adapters/
│   ├── epub/
│   ├── pdf/
│   ├── text/
│   ├── ai-core/
│   ├── ai-providers/
│   ├── rag/
│   ├── tts/
│   ├── dictionary/
│   ├── notes/
│   ├── sync/
│   ├── storage/
│   ├── shared/
│   ├── protocol/
│   └── types/
│
├── src-tauri/
│   └── src/
│       ├── commands/
│       ├── events/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── storage/
│       ├── sync/
│       ├── ai/
│       ├── security/
│       ├── system/
│       └── updater/
│
├── schemas/
│   ├── commands/
│   ├── events/
│   ├── entities/
│   └── errors/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── e2e/
│
├── scripts/
│
├── docs/
│   ├── architecture/
│   ├── protocol/
│   ├── decisions/
│   └── development/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── Cargo.toml
```

实际结构可以根据项目现状调整。

但是必须保持：

> Domain / Application / Infrastructure / UI 解耦。

---

# 4. CORE DOMAINS

系统必须拆分为以下 Domain：

```text
Book
Library
Reader
Annotation
Note
Theme
Settings
AI
RAG
TTS
Dictionary
Learning
Character
Sync
Account
Storage
Updater
Task
Security
```

每个 Domain 都必须：

```text
拥有自己的类型
拥有自己的 Service
拥有自己的 Repository
拥有自己的 Error
拥有自己的 Events
拥有自己的 Tests
```

---

# 5. DOMAIN MODEL

## 5.1 Book

```ts
Book {
  id
  sourceId
  metadata
  cover
  format
  size
  hash
  status
  createdAt
  updatedAt
  version
}
```

---

# 5.2 BookMetadata

```ts
BookMetadata {
  title
  subtitle
  authors
  publisher
  language
  description
  isbn
  subjects
  cover
}
```

---

# 5.3 Chapter

```ts
Chapter {
  id
  bookId
  index
  title
  href
  parentId
  level
}
```

---

# 5.4 ReadingLocation

必须支持统一抽象：

```ts
ReadingLocation {
  bookId
  chapterId
  cfi?
  href?
  progress
  page?
  offset?
}
```

---

# 5.5 ReadingSession

```ts
ReadingSession {
  id
  bookId
  startedAt
  endedAt?
  duration
  startLocation
  endLocation
}
```

---

# 5.6 Bookmark

```ts
Bookmark {
  id
  bookId
  location
  title?
  note?
  createdAt
  updatedAt
}
```

---

# 5.7 Annotation

```ts
Annotation {
  id
  bookId
  location
  selectedText
  color
  note?
  createdAt
  updatedAt
}
```

---

# 5.8 Note

```ts
Note {
  id
  bookId
  chapterId?
  title?
  content
  sourceAnnotationId?
  tags
  createdAt
  updatedAt
}
```

---

# 5.9 AIConversation

```ts
AIConversation {
  id
  bookId?
  title
  model
  provider
  messages
  createdAt
  updatedAt
}
```

---

# 5.10 AIMessage

```ts
AIMessage {
  id
  conversationId
  role
  content
  citations
  model
  createdAt
}
```

---

# 5.11 AITask

```ts
AITask {
  id
  type
  status
  progress
  input
  output?
  error?
  cancellable
  createdAt
  startedAt?
  completedAt?
}
```

状态：

```text
pending
running
paused
completed
failed
cancelled
```

---

# 5.12 RAGDocument

```ts
RAGDocument {
  id
  bookId
  chapterId
  content
  metadata
}
```

---

# 5.13 RAGChunk

```ts
RAGChunk {
  id
  documentId
  text
  index
  embedding
  metadata
}
```

---

# 5.14 Character

```ts
Character {
  id
  bookId
  name
  aliases
  personality
  appearance
  relationships
  importantEvents
  quotes
  tags
  image?
  voice?
}
```

---

# 5.15 SyncRecord

```ts
SyncRecord {
  id
  entityType
  entityId
  operation
  version
  updatedAt
  deviceId
}
```

---

# 5.16 SyncConflict

```ts
SyncConflict {
  id
  entityType
  entityId
  localVersion
  remoteVersion
  resolution?
  createdAt
}
```

---

# 6. READER ENGINE

这是整个项目最重要的抽象之一。

业务层：

> 永远不能直接依赖 foliate-js。

必须：

```text
ReaderEngine
      ↓
FoliateAdapter
      ↓
foliate-js
```

---

# 7. ReaderEngine Contract

```ts
interface ReaderEngine {
  open(source: BookSource): Promise<void>

  close(): Promise<void>

  getMetadata(): Promise<BookMetadata>

  getTableOfContents(): Promise<TocItem[]>

  getCurrentLocation(): Promise<ReadingLocation>

  goTo(location: ReadingLocation): Promise<void>

  nextPage(): Promise<void>

  previousPage(): Promise<void>

  search(query: string): Promise<SearchResult[]>

  getText(range?: TextRange): Promise<string>

  createAnnotation(annotation: Annotation): Promise<void>

  removeAnnotation(id: string): Promise<void>

  setTheme(theme: ReaderTheme): Promise<void>

  setLayout(layout: ReaderLayout): Promise<void>

  destroy(): Promise<void>
}
```

未来如果更换阅读内核：

```text
FoliateAdapter
PdfAdapter
TextAdapter
```

业务层无需修改。

---

# 8. READING PIPELINE

统一：

```text
Book File
   ↓
Book Detector
   ↓
Format Adapter
   ↓
Parser
   ↓
Reader Engine
   ↓
Reading View
```

不得：

```text
UI → Parser
UI → File System
UI → foliate-js
```

---

# 9. FORMAT STRATEGY

第一阶段：

```text
EPUB
TXT
PDF
```

第二阶段：

```text
MOBI
AZW3
FB2
CBZ
Markdown
```

第三阶段：

```text
CHM
Additional formats
```

重要：

> 只有经过真实测试的格式才能标记为 Supported。

---

# 10. EPUB

foliate-js 作为核心 EPUB 阅读能力。

必须支持：

```text
Metadata
TOC
Pagination
Scroll
CFI
Selection
Search
Annotation
Progress
Themes
```

---

# 11. TXT / 网文增强

TXT 必须进入：

```text
TextNormalizationPipeline
```

Pipeline：

```text
Encoding Detection
 ↓
Decode
 ↓
Whitespace Normalization
 ↓
Line Break Repair
 ↓
Paragraph Detection
 ↓
Chapter Detection
 ↓
Text Enhancement
 ↓
Reader
```

支持：

- GBK
- GB18030
- UTF-8
- UTF-16
- Big5
- Other common encodings

---

# 12. ColorTxt 能力融合

将 ColorTxt 的优势作为：

```text
Text Enhancement Layer
```

而不是污染 Reader Core。

支持：

```text
Smart Coloring
Chapter Detection
Text Repair
Traditional/Simplified Conversion
Whitespace Cleanup
Line Break Repair
Dictionary
Translation
Advanced Wrapping
```

---

# 13. SMART COLORING

支持：

```text
Keyword
Character
Term
Dialogue
Important Content
```

用户可以配置：

```text
color
opacity
scope
priority
```

亮色/暗色主题自动适配。

---

# 14. TEXT REPAIR

支持：

```text
Typo Correction
Broken Line Repair
Whitespace Cleanup
Punctuation Normalization
Traditional → Simplified
Simplified → Traditional
Full-width → Half-width
HTML Cleanup
Advertisement Removal
Watermark Removal
```

任何自动修改：

> 必须支持 Diff。

---

# 15. CHAPTER DETECTION

采用：

```text
Built-in Rules
+
User Rules
+
AI Generated Rules
```

规则：

```ts
ChapterRule {
  id
  name
  pattern
  priority
  enabled
}
```

AI 可以根据当前书籍：

> 生成专属 Chapter Rule。

但必须允许用户审核。

---

# 16. READER MODES

## Pagination

```text
Single Page
Dual Page
Responsive
```

## Scroll

```text
Vertical
Smooth
Chapter Scroll
```

必须统一：

```text
Progress
CFI
Annotation
Bookmark
Chapter
```

---

# 17. READER SETTINGS

统一：

```ts
ReaderSettings {
  fontFamily
  fontSize
  fontWeight
  lineHeight
  letterSpacing
  paragraphSpacing
  textIndent
  alignment
  pageMargin
  contentWidth
  columnCount
  background
  theme
  pageMode
  animation
}
```

设置必须：

```text
即时预览
即时生效
持久化
可同步
```

---

# 18. DESIGN SYSTEM

视觉：

> Apple-inspired Liquid Glass + Super Rounded UI

核心原则：

```text
Minimal
Calm
Premium
Readable
Fluid
```

必须建立 Design Token：

```text
Color
Typography
Spacing
Radius
Shadow
Blur
Opacity
Motion
Elevation
```

禁止页面自己随意定义颜色和圆角。

---

# 19. LIQUID GLASS

所有主要容器支持：

```text
Translucency
Backdrop Blur
Border
Soft Shadow
Highlight
Layered Depth
```

但是：

> 阅读正文区域优先保证文字可读性。

正文不要过度玻璃化。

---

# 20. MOTION SYSTEM

建立统一：

```text
MotionToken
```

包括：

```text
duration
easing
spring
delay
```

支持：

```text
60Hz
90Hz
120Hz
Reduced Motion
```

禁止动画阻塞主阅读流程。

---

# 21. LIBRARY

必须支持：

```text
Grid
List
Cover
Progress
Author
Tag
Collection
Favorite
Search
Filter
Sort
Recent
```

支持：

```text
File Drop
Folder Import
Batch Import
```

---

# 22. BOOK IMPORT PIPELINE

```text
File
 ↓
Validation
 ↓
Hash
 ↓
Format Detection
 ↓
Metadata Extraction
 ↓
Cover Extraction
 ↓
Database
 ↓
Library
```

大文件：

> 必须优先流式处理。

---

# 23. STORAGE

业务层禁止直接依赖 SQLite API。

必须：

```text
Repository
 ↓
Storage Interface
 ↓
SQLite / Filesystem
```

支持：

```text
Migration
Versioning
Backup
Restore
Integrity Check
Recovery
```

---

# 24. DATABASE MIGRATION

每次 Schema 修改：

必须生成：

```text
migration
```

禁止：

> 修改数据库 Schema 后要求用户删除数据库。

---

# 25. TASK SYSTEM

所有耗时任务进入：

```text
TaskManager
```

包括：

```text
Import
Parsing
Indexing
Embedding
AI Processing
TTS
Sync
Backup
Restore
Update
```

---

# 26. TASK MANAGER

```ts
interface TaskManager {
  create()
  start()
  pause()
  resume()
  cancel()
  retry()
  get()
  list()
}
```

任务必须支持：

```text
progress
status
error
retry
cancel
```

---

# 27. BACKGROUND EXECUTION

以下任务不能阻塞阅读：

```text
AI
Embedding
RAG Index
Book Repair
TTS
Sync
Backup
```

使用：

```text
Worker
Background Task
Rust Async
```

根据平台选择最合理方案。

---

# 28. AI ARCHITECTURE

必须：

```text
UI
 ↓
AIService
 ↓
AIProvider
 ↓
Provider Adapter
```

禁止：

```text
React → OpenAI
React → DeepSeek
React → Ollama
```

---

# 29. AIProvider

统一：

```ts
interface AIProvider {
  chat(request)
  streamChat(request)
  embeddings(request)
  generateImage(request)
}
```

Provider 必须支持：

```text
timeout
retry
stream
cancel
error normalization
```

---

# 30. PROVIDERS

Cloud：

```text
OpenAI
Gemini
DeepSeek
Qwen
Kimi
Zhipu
MiniMax
```

Local：

```text
Ollama
LM Studio
```

架构必须允许未来添加：

```text
Any OpenAI-compatible API
```

---

# 31. MODEL CONFIGURATION

分别配置：

```text
Chat Model
Embedding Model
Image Model
TTS Model
```

例如：

```text
Chat → Cloud
Embedding → Local
Image → Local
TTS → Cloud
```

完全独立。

---

# 32. RAG ARCHITECTURE

```text
Book
 ↓
Parser
 ↓
Normalizer
 ↓
Chapter Splitter
 ↓
Chunker
 ↓
Embedding
 ↓
Vector Store
 ↓
Retriever
 ↓
Reranker
 ↓
LLM
```

---

# 33. RAG REQUIREMENTS

支持：

```text
Semantic Search
Keyword Search
Hybrid Search
Metadata Filter
Chapter Filter
Context Window Control
Citation
```

AI回答必须提供：

```text
Chapter
Location
Source Text
```

如果无法提供可靠来源：

> 必须明确标记为模型推测。

---

# 34. AI CHAT

支持：

```text
Current Selection
Current Chapter
Current Book
Library
```

上下文范围必须明确显示。

例如：

```text
Context:
Current Selection

Context:
Current Chapter

Context:
Entire Book
```

---

# 35. AI BOOK PROCESSOR

Pipeline：

```text
Original
 ↓
Parse
 ↓
Analyze
 ↓
Transform
 ↓
Diff
 ↓
Review
 ↓
Apply
 ↓
New Version
```

支持：

```text
Typo
Formatting
Chapter
Advertisement
Watermark
Whitespace
Punctuation
Translation
Style
```

---

# 36. AI DIFF ENGINE

Diff 类型：

```text
Added
Removed
Modified
Moved
```

支持：

```text
Accept One
Reject One
Edit One
Accept All
Reject All
```

---

# 37. VERSION CONTROL

书籍处理必须拥有：

```text
BookVersion
```

例如：

```text
Original
 ↓
Cleaned
 ↓
Corrected
 ↓
Translated
```

支持：

```text
Rollback
Compare
Restore
Export
```

---

# 38. AI BOOK SUMMARY

支持：

```text
Book Summary
Chapter Summary
Outline
Key Points
Quotes
Knowledge Points
```

结果必须保存为结构化数据。

---

# 39. CHARACTER EXTRACTION

AI自动抽取：

```text
Character
Alias
Personality
Appearance
Relationship
Important Events
Quotes
```

支持 Character Graph。

---

# 40. KNOWLEDGE GRAPH

支持：

```text
Character Graph
Mind Map
Timeline
Concept Graph
Knowledge Graph
Keyword Cloud
```

要求：

```text
Interactive
Zoom
Pan
Search
Export
```

---

# 41. LEARNING SYSTEM

针对教材：

```text
Book
 ↓
Knowledge Extraction
 ↓
Concept
 ↓
Question
 ↓
Review
```

支持：

```text
Multiple Choice
Fill Blank
Short Answer
Essay
Flashcard
Mistake Book
Spaced Repetition
```

---

# 42. NOTE SYSTEM

支持：

```text
Manual Note
Annotation Note
AI Note
Chapter Note
Book Note
```

AI可以：

```text
Merge
Deduplicate
Categorize
Summarize
Structure
```

---

# 43. DICTIONARY

定义：

```ts
DictionaryProvider
```

支持：

```text
MDict
StarDict
Slob
BGL
DICT
```

选词：

```text
Dictionary
Translation
AI Explanation
```

统一 Selection Toolbar。

---

# 44. TTS

统一：

```ts
TTSProvider
```

支持：

```text
System TTS
Edge TTS
Cloud TTS
Local TTS
```

能力：

```text
Speed
Pitch
Pause
Emotion
Replay
Timer
Offline
```

---

# 45. MULTI-CHARACTER TTS

AI自动识别：

```text
Narrator
Character A
Character B
Character C
```

每个角色可以绑定：

```text
Voice
Speed
Pitch
Emotion
```

---

# 46. AUDIOBOOK PIPELINE

```text
Book
 ↓
Text Segmentation
 ↓
Dialogue Detection
 ↓
Character Detection
 ↓
Voice Assignment
 ↓
TTS
 ↓
Audio Cache
 ↓
Audiobook
```

支持：

```text
Segment Export
Full Book Export
Offline Playback
Resume
```

---

# 47. LOCAL AI

支持：

```text
Ollama
LM Studio
Local Embedding
Local Vector Database
```

目标：

> 书籍内容可以在本地完成 AI 处理。

---

# 48. CLOUD AI PRIVACY

任何 Cloud AI 请求必须明确：

```text
Provider
Model
Data Sent
Reason
```

默认：

> 不上传整本书。

只有用户明确开启全书处理时：

> 才允许发送相应内容。

---

# 49. API KEY SECURITY

禁止：

```text
localStorage
plain JSON
source code
```

存储 API Key。

优先使用：

```text
OS Keychain
Credential Manager
Secure Storage
```

---

# 50. SYNC ARCHITECTURE

必须：

```text
Local First
 ↓
Sync Queue
 ↓
Sync Engine
 ↓
Cloud Provider
```

支持：

```text
Offline
Online
Retry
Conflict
Merge
Rollback
```

---

# 51. SYNC STRATEGY

不同数据使用不同策略：

```text
Progress
→ Latest Valid State

Notes
→ Merge

Annotations
→ Merge

Settings
→ Latest

Metadata
→ Field Merge
```

不能所有数据统一 Last Write Wins。

---

# 52. CONFLICT RESOLUTION

无法自动解决：

必须展示：

```text
Local
Remote
Merged
```

用户选择：

```text
Keep Local
Keep Remote
Keep Both
Manual Merge
```

---

# 53. WEBDAV

WebDAV 作为：

```text
CloudStorageProvider
```

不能污染：

```text
SyncEngine
```

支持：

```text
Backup
Restore
Sync
Export
Import
```

---

# 54. BOOK PACKAGE

设计：

```text
BookPackage
```

包含：

```text
book
metadata
annotations
notes
characters
settings
ai-data
```

必须拥有：

```text
packageVersion
```

支持 Migration。

---

# 55. ACCOUNT

支持：

```text
Guest
Register
Login
Logout
Delete
Device Management
Session Management
```

Guest：

> 不得限制本地阅读核心功能。

登录后：

```text
Local
 ↓
Merge
 ↓
Cloud
```

---

# 56. UPDATE SYSTEM

统一：

```text
UpdateService
```

支持：

```text
Check
Download
Progress
Verify
Install
Rollback
Ignore
```

更新包必须：

```text
Integrity Check
Signature Verification
```

---

# 57. IPC PROTOCOL

React 与 Rust 之间必须拥有统一 Protocol。

每个 Command 必须定义：

```text
Command Name
Request
Response
Error
Version
```

例如：

```text
book.import
book.open
book.close
reader.goto
reader.next
reader.previous
reader.progress.get
reader.progress.set
ai.chat
ai.task.cancel
sync.start
sync.resolve
```

---

# 58. SCHEMA-FIRST

Protocol 必须：

```text
Schema
 ↓
Rust Types
 ↓
TypeScript Types
 ↓
Runtime Validation
 ↓
Contract Tests
```

推荐：

```text
JSON Schema
+
Zod
+
Rust serde
```

---

# 59. EVENTS

统一事件：

```text
reader.progress.changed
reader.chapter.changed
reader.selection.changed

book.import.started
book.import.progress
book.import.completed
book.import.failed

ai.task.started
ai.task.progress
ai.task.completed
ai.task.failed

sync.started
sync.progress
sync.completed
sync.conflict

tts.started
tts.progress
tts.completed
tts.failed
```

每个 Event 必须拥有：

```text
name
version
payload
```

---

# 60. ERROR SYSTEM

错误码必须统一：

```text
BOOK_*
READER_*
AI_*
RAG_*
SYNC_*
AUTH_*
STORAGE_*
TTS_*
PDF_*
SYSTEM_*
SECURITY_*
```

标准：

```ts
AppError {
  code
  message
  cause
  retryable
  context
}
```

禁止把：

```text
Rust panic
Stack trace
Internal error
```

直接显示给用户。

---

# 61. STATE MACHINE

关键流程必须使用状态机。

例如：

## Book Import

```text
Idle
 ↓
Detecting
 ↓
Parsing
 ↓
Extracting
 ↓
Saving
 ↓
Completed
```

异常：

```text
Any
 ↓
Failed
 ↓
Retry
```

---

# 62. AI TASK STATE MACHINE

```text
Pending
 ↓
Running
 ↓
Completed
```

异常：

```text
Running
 ↓
Failed
 ↓
Retrying
 ↓
Running
```

支持：

```text
Pause
Cancel
Retry
```

---

# 63. SYNC STATE MACHINE

```text
Idle
 ↓
Preparing
 ↓
Uploading
 ↓
Downloading
 ↓
Merging
 ↓
Completed
```

冲突：

```text
Merging
 ↓
Conflict
 ↓
Resolve
 ↓
Merging
```

---

# 64. TRANSACTION

涉及多个实体的数据修改必须支持 Transaction。

例如：

```text
Apply AI Diff
```

必须：

```text
Begin
 ↓
Validate
 ↓
Apply
 ↓
Update Metadata
 ↓
Commit
```

失败：

```text
Rollback
```

---

# 65. RETRY

网络任务：

```text
Timeout
Retryable Error
Connection Lost
Rate Limit
```

使用：

```text
Exponential Backoff
```

必须：

```text
max retries
timeout
jitter
cancellation
```

禁止无限重试。

---

# 66. OBSERVABILITY

统一：

```text
Logger
PerformanceMonitor
TaskMonitor
CrashReporter
```

日志必须分级：

```text
DEBUG
INFO
WARN
ERROR
```

默认禁止记录：

```text
Book Full Text
Notes
API Keys
Tokens
Sensitive User Data
```

---

# 67. SECURITY

必须防御：

```text
XSS
Path Traversal
SSRF
Command Injection
Malicious EPUB
Malicious HTML
Arbitrary File Access
API Key Leakage
Unsafe URL
```

电子书：

> 永远视为 Untrusted Input。

---

# 68. EPUB SANDBOX

EPUB 内容不得：

```text
读取系统文件
访问 Secret
执行 Native Command
访问任意 IPC
```

必须建立安全边界。

---

# 69. PERFORMANCE

目标：

```text
Fast Startup
Low Memory
Smooth Reader
Non-blocking AI
Lazy Loading
Streaming
Background Processing
```

阅读：

```text
60fps+
```

高刷：

```text
90Hz / 120Hz
```

---

# 70. LARGE BOOK

必须考虑：

```text
100MB+
```

电子书。

禁止：

```text
整个文件一次性加载到 JS Memory
```

优先：

```text
Streaming
Lazy Loading
Chunking
Virtualization
```

---

# 71. MOBILE

移动端不是 Desktop UI 缩小版。

必须设计：

```text
Touch
Swipe
Gesture
Bottom Sheet
Safe Area
Orientation
Keyboard
System Back
```

---

# 72. DESKTOP

支持：

```text
Window Resize
Window Drag
Keyboard
Mouse
Trackpad
Fullscreen
Multi-window
Global Shortcut
```

---

# 73. READER UI

阅读界面：

```text
Top Toolbar
Side Panel
Reading Canvas
Bottom Progress
Selection Toolbar
AI Toolbar
Chapter Navigation
```

阅读时：

> 工具栏自动淡出。

---

# 74. SELECTION TOOLBAR

选中文本：

```text
Copy
Highlight
Note
Dictionary
Translate
Explain
Rewrite
Ask AI
```

移动端采用：

```text
Bottom Sheet
```

桌面采用：

```text
Floating Toolbar
```

---

# 75. KEYBOARD COMMAND SYSTEM

建立：

```text
CommandRegistry
```

例如：

```text
Next Page
Previous Page
Search
Sidebar
AI
Bookmark
TTS
Fullscreen
Hide Window
```

全部可配置。

---

# 76. MISSION CONTROL / MISSING MODE

桌面端支持独立：

```text
Discreet Reading Mode
```

支持：

```text
Global Hotkey
Hide Window
Background
Restore
```

该功能必须作为独立 Feature。

---

# 77. TEST ARCHITECTURE

测试分四层：

```text
Unit
Integration
Contract
E2E
```

---

# 78. UNIT TEST

覆盖：

```text
Parser
Chapter Detector
Text Normalizer
Diff
Progress
Settings
RAG Chunking
Conflict Resolver
State Machine
```

---

# 79. INTEGRATION TEST

覆盖：

```text
Import
Open
Read
Progress
Annotation
Note
AI
Sync
Backup
Restore
```

---

# 80. CONTRACT TEST

以下必须拥有 Contract Test：

```text
ReaderEngine
AIProvider
TTSProvider
DictionaryProvider
Storage
CloudProvider
SyncEngine
```

任何新 Provider：

> 必须通过 Contract Test。

---

# 81. E2E

核心流程：

```text
Import Book
 ↓
Open
 ↓
Read
 ↓
Select Text
 ↓
Highlight
 ↓
Note
 ↓
Close
 ↓
Reopen
 ↓
Progress Restored
```

AI流程：

```text
Open Book
 ↓
Ask AI
 ↓
RAG Retrieval
 ↓
Answer
 ↓
Citation
```

---

# 82. ACCESSIBILITY

必须考虑：

```text
Keyboard Navigation
Focus
Screen Reader
Reduced Motion
Contrast
Touch Target
Font Scaling
```

---

# 83. CI

必须：

```text
Lint
Typecheck
Unit Test
Integration Test
Contract Test
Build
cargo check
cargo test
```

PR不通过：

> 禁止合并。

---

# 84. DOCUMENTATION

必须维护：

```text
README
Architecture
ADR
Protocol
Development Guide
Testing Guide
Release Guide
```

重要架构决策使用：

```text
ADR
```

记录。

---

# 85. ADR

例如：

```text
ADR-001 Reader Engine
ADR-002 Storage
ADR-003 AI Provider
ADR-004 RAG
ADR-005 Sync
ADR-006 TTS
ADR-007 Security
```

---

# 86. DEVELOPMENT PHASES

整个项目必须按照以下阶段开发。

---

# PHASE 0 — FOUNDATION

目标：

> 建立工程骨架。

实现：

```text
Monorepo
Tauri
Rust
React
TypeScript
Vite
ESLint
Prettier
Testing
CI
Design Tokens
Protocol
Error System
Logger
```

验收：

```text
Build
Typecheck
Lint
Rust Check
Tests
```

全部通过。

---

# PHASE 1 — CORE READER

实现：

```text
Book Import
Library
EPUB
TXT
PDF
ReaderEngine
FoliateAdapter
Progress
TOC
Search
Bookmark
Annotation
Settings
```

验收：

```text
真实 EPUB
真实 TXT
真实 PDF
```

全部可以打开。

---

# PHASE 2 — PREMIUM READING

实现：

```text
Liquid Glass
Themes
Typography
Animation
Scroll
Pagination
Dual Page
Selection Toolbar
Dictionary
Text Enhancement
```

---

# PHASE 3 — AI FOUNDATION

实现：

```text
AIProvider
Model Config
Streaming
AI Chat
RAG
Embedding
Vector Store
Retriever
Citation
```

---

# PHASE 4 — AI BOOK INTELLIGENCE

实现：

```text
AI Repair
Diff
Chapter Reconstruction
Summary
Outline
Characters
Graph
AI Notes
```

---

# PHASE 5 — LEARNING + TTS

实现：

```text
TTS
Multi-character
Audiobook
Flashcard
Quiz
Mistake Book
Spaced Repetition
```

---

# PHASE 6 — CLOUD

实现：

```text
Auth
Sync
Conflict
Backup
Restore
WebDAV
```

---

# PHASE 7 — CROSS PLATFORM

依次：

```text
macOS
Windows
Linux
Android
iOS
```

每个平台必须单独验证。

---

# PHASE 8 — PRODUCTION

实现：

```text
Security Audit
Performance
Crash Recovery
Updater
Release Pipeline
Signing
Documentation
```

---

# 87. SPRINT EXECUTION

每个 Phase 再拆成 Sprint。

每个 Sprint 必须遵循：

```text
Read
 ↓
Inspect
 ↓
Plan
 ↓
Implement
 ↓
Test
 ↓
Review
 ↓
Optimize
 ↓
Document
```

---

# 88. SPRINT 0

任务：

```text
[ ] Repository inspection
[ ] Architecture report
[ ] Dependency audit
[ ] Risk analysis
[ ] Directory structure
[ ] Protocol design
[ ] Domain model
[ ] Testing strategy
```

产物：

```text
docs/architecture/overview.md
docs/architecture/domain-model.md
docs/architecture/protocol.md
docs/architecture/risks.md
```

---

# 89. SPRINT 1

Foundation：

```text
[ ] React
[ ] TypeScript
[ ] Tauri
[ ] Rust
[ ] Vite
[ ] Workspace
[ ] ESLint
[ ] Prettier
[ ] Vitest
[ ] Rust tests
```

---

# 90. SPRINT 2

Protocol：

```text
[ ] JSON Schema
[ ] Zod
[ ] Rust serde
[ ] Commands
[ ] Events
[ ] Errors
[ ] Contract tests
```

---

# 91. SPRINT 3

Storage：

```text
[ ] Database
[ ] Migration
[ ] Repository
[ ] Book
[ ] Bookmark
[ ] Annotation
[ ] Note
[ ] Settings
```

---

# 92. SPRINT 4

Reader：

```text
[ ] ReaderEngine
[ ] FoliateAdapter
[ ] EPUB
[ ] Location
[ ] Progress
[ ] TOC
```

---

# 93. SPRINT 5

Library：

```text
[ ] Import
[ ] Metadata
[ ] Cover
[ ] Search
[ ] Sort
[ ] Filter
[ ] Collections
```

---

# 94. SPRINT 6

Reader UX：

```text
[ ] Pagination
[ ] Scroll
[ ] Themes
[ ] Typography
[ ] Selection
[ ] Annotation
```

---

# 95. SPRINT 7

AI Foundation：

```text
[ ] AI Core
[ ] Provider
[ ] OpenAI-compatible
[ ] Ollama
[ ] Streaming
[ ] Cancellation
```

---

# 96. SPRINT 8

RAG：

```text
[ ] Parser
[ ] Chunking
[ ] Embedding
[ ] Vector DB
[ ] Retrieval
[ ] Citation
```

---

# 97. SPRINT 9

AI Processing：

```text
[ ] Repair
[ ] Diff
[ ] Review
[ ] Version
[ ] Rollback
```

---

# 98. SPRINT 10

AI Knowledge：

```text
[ ] Summary
[ ] Outline
[ ] Character
[ ] Timeline
[ ] Graph
[ ] AI Notes
```

---

# 99. SPRINT 11

TTS：

```text
[ ] Provider
[ ] System TTS
[ ] Cloud TTS
[ ] Multi Voice
[ ] Audiobook
```

---

# 100. SPRINT 12

Learning：

```text
[ ] Flashcard
[ ] Quiz
[ ] Review
[ ] Mistake Book
[ ] Spaced Repetition
```

---

# 101. SPRINT 13

Sync：

```text
[ ] Auth
[ ] Device
[ ] Sync Queue
[ ] Upload
[ ] Download
[ ] Conflict
```

---

# 102. SPRINT 14

Cloud：

```text
[ ] Backup
[ ] Restore
[ ] WebDAV
[ ] Book Package
```

---

# 103. SPRINT 15

Cross Platform：

```text
[ ] macOS
[ ] Windows
[ ] Linux
[ ] Android
[ ] iOS
```

---

# 104. SPRINT 16

Production：

```text
[ ] Security
[ ] Performance
[ ] Crash Recovery
[ ] Update
[ ] Signing
[ ] Release
```

---

# 105. DEFINITION OF DONE

任何 Feature 必须满足：

```text
[ ] Implemented
[ ] Typed
[ ] Tested
[ ] Error handled
[ ] Loading state
[ ] Empty state
[ ] Error state
[ ] Cancel state
[ ] Retry state
[ ] Desktop
[ ] Mobile
[ ] Accessibility
[ ] Performance
[ ] Documentation
```

---

# 106. FEATURE QUALITY GATE

一个 Feature 只有同时满足：

```text
Correct
+
Stable
+
Tested
+
Typed
+
Recoverable
+
Documented
```

才可以标记：

```text
DONE
```

---

# 107. AGENT SELF-REVIEW

每个 Sprint 完成后必须主动检查：

```text
Architecture
Security
Performance
Type Safety
Error Handling
Testing
UX
Cross Platform
```

然后回答：

```text
What did I implement?

What did I change?

Why?

What could break?

What tests prove it works?

What remains?

What technical debt was created?
```

---

# 108. NO SILENT TRADEOFF

如果必须在：

```text
Performance
Architecture
Compatibility
Feature Scope
```

之间做取舍：

必须明确记录：

```text
Decision
Reason
Alternative
Tradeoff
Future Migration
```

并建立 ADR。

---

# 109. NO UNCONTROLLED DEPENDENCIES

添加任何 npm / Rust dependency 前必须评估：

```text
Maintenance
License
Bundle Size
Security
Performance
Platform Support
```

不允许：

> 为一个几十行功能引入重量级依赖。

---

# 110. LICENSE

所有第三方依赖必须检查：

```text
License
Redistribution
Commercial Use
Modification
```

特别关注：

```text
MIT
Apache-2.0
BSD
MPL
GPL
AGPL
```

如果 License 对商业闭源发布存在影响：

> 必须立即报告。

---

# 111. FOLIATE-JS RULE

必须遵守：

> foliate-js 是核心阅读引擎，但不能成为整个系统的架构耦合点。

必须：

```text
FoliateAdapter
```

隔离。

禁止业务层直接调用：

```text
foliate-js internal API
```

---

# 112. PDF RULE

PDF 与 EPUB 不强行共享渲染实现。

共享：

```text
Reader Domain
Progress
Annotation
Settings
```

但：

```text
PDF Renderer
EPUB Renderer
```

必须独立。

---

# 113. MOBILE REALITY

不要假设：

```text
Tauri Desktop
=
Tauri Mobile
```

任何 Native Capability：

必须检查：

```text
macOS
Windows
Linux
Android
iOS
```

实际能力。

如果平台不支持：

> 使用 Platform Adapter。

---

# 114. PLATFORM ABSTRACTION

建立：

```ts
PlatformService
```

支持：

```text
FileSystem
Window
Notification
Clipboard
Share
TTS
SecureStorage
Updater
Shortcut
```

---

# 115. NO PLATFORM CHECKS EVERYWHERE

禁止：

```ts
if (isMac) ...
if (isWindows) ...
if (isIOS) ...
```

散落整个项目。

必须集中：

```text
PlatformAdapter
```

---

# 116. DATA FLOW

核心数据流必须清晰：

```text
User
 ↓
UI
 ↓
UseCase
 ↓
Domain
 ↓
Repository
 ↓
Infrastructure
```

外部数据：

```text
External
 ↓
Adapter
 ↓
Validation
 ↓
Domain
```

---

# 117. UNTRUSTED INPUT

以下全部视为不可信：

```text
EPUB
PDF
TXT
HTML
AI Output
Cloud Data
Plugin Data
Imported Package
WebDAV Data
```

必须：

```text
Validate
Sanitize
Normalize
Limit
```

---

# 118. AI OUTPUT

AI输出不能直接进入数据库。

必须：

```text
AI Output
 ↓
Schema Validation
 ↓
Business Validation
 ↓
Human Review
 ↓
Persist
```

---

# 119. STRUCTURED AI

尽可能使用：

```text
Structured Output
JSON Schema
```

而不是：

```text
自由文本 → 正则 → 猜结构
```

---

# 120. AI COST CONTROL

必须支持：

```text
Token Limit
Context Limit
Max Output
Timeout
Budget
Model Selection
```

大任务：

> 必须后台执行。

---

# 121. RAG COST CONTROL

不要每次问答都重新：

```text
Embedding
Parsing
Indexing
```

必须：

```text
Cache
Incremental Index
Persistent Vector Store
```

---

# 122. AI CACHE

支持：

```text
Prompt Cache
Embedding Cache
Response Cache
TTS Cache
Image Cache
```

但必须考虑：

```text
Privacy
Storage
Invalidation
Version
```

---

# 123. CACHE INVALIDATION

当：

```text
Book Version
Parser Version
Embedding Model
Chunk Strategy
```

发生变化：

必须判断是否需要重新索引。

---

# 124. VERSIONING

以下都必须版本化：

```text
Database
BookPackage
Protocol
AI Schema
RAG Index
Settings
Sync
```

---

# 125. MIGRATION

所有版本升级必须支持：

```text
Old
 ↓
Detect Version
 ↓
Migration
 ↓
Validate
 ↓
New
```

---

# 126. BACKUP

备份前：

```text
Flush
Validate
Snapshot
Checksum
```

恢复后：

```text
Validate
Migration
Integrity Check
```

---

# 127. CORRUPTION RECOVERY

如果：

```text
Database Corrupted
Book Package Corrupted
Sync Data Corrupted
```

必须：

```text
Detect
Report
Backup
Recover
```

而不是直接崩溃。

---

# 128. CRASH RECOVERY

应用异常退出后：

必须恢复：

```text
Last Reading Position
Pending Tasks
Sync Queue
Unsaved Notes
```

---

# 129. AUTOSAVE

重要用户数据：

```text
Annotation
Note
Progress
Bookmark
Settings
```

必须自动保存。

---

# 130. READING PROGRESS

Progress 不应该只保存：

```text
percentage
```

必须尽可能保存：

```text
CFI
Chapter
Page
Offset
Percentage
Timestamp
```

保证恢复准确。

---

# 131. MULTI-DEVICE PROGRESS

不同设备：

```text
Device A
Device B
```

发生进度冲突：

> 必须根据 timestamp + location + session 判断，而不是简单覆盖。

---

# 132. USER EXPERIENCE

所有操作必须拥有：

```text
Loading
Success
Error
Empty
Disabled
Retry
```

状态。

禁止：

> 点击按钮后完全没有反馈。

---

# 133. LONG TASK UX

AI / Sync / Import / TTS：

必须显示：

```text
Progress
Current Step
Elapsed Time
Cancel
Retry
```

后台运行时：

> 用户可以继续阅读。

---

# 134. NOTIFICATION

长任务完成：

可以通知：

```text
AI Processing Completed
Book Imported
Sync Completed
TTS Completed
Update Ready
```

但必须：

> 可关闭。

---

# 135. SETTINGS

设置分区：

```text
General
Reading
Appearance
Typography
AI
RAG
TTS
Dictionary
Shortcuts
Storage
Sync
Account
Privacy
Updates
Advanced
```

---

# 136. ADVANCED SETTINGS

普通用户默认隐藏：

```text
Debug
Performance
RAG Parameters
Model Parameters
Cache
Experimental Features
```

---

# 137. FEATURE FLAGS

实验功能必须：

```text
FeatureFlag
```

例如：

```text
experimental.pdf.darkMode
experimental.ai.reranker
experimental.local.embedding
```

---

# 138. RELEASE CHANNEL

支持：

```text
Stable
Beta
Nightly
```

实验功能：

> 默认仅 Beta / Nightly。

---

# 139. PERFORMANCE MONITOR

开发模式显示：

```text
FPS
Memory
CPU
Reader Render Time
AI Task Count
RAG Query Time
```

生产环境：

> 默认关闭详细性能面板。

---

# 140. DEBUG MODE

开发模式可以：

```text
Inspect Events
Inspect IPC
Inspect Tasks
Inspect Reader State
Inspect RAG
Inspect Sync
```

但：

> Debug UI 不得进入生产默认界面。

---

# 141. FINAL PRODUCT INFORMATION ARCHITECTURE

最终产品至少：

```text
Library
│
├── All Books
├── Recent
├── Favorites
├── Collections
└── Tags

Reader
│
├── TOC
├── Search
├── Notes
├── Dictionary
├── AI
└── TTS

AI
│
├── Assistant
├── Book Processing
├── Summary
├── Characters
├── Knowledge Graph
├── Learning
└── Notes

Settings
│
├── Reading
├── Appearance
├── AI
├── TTS
├── Sync
├── Storage
├── Account
└── Advanced
```

---

# 142. FINAL ENGINEERING STANDARD

最终项目必须达到：

```text
Production Ready
```

而不是：

```text
Demo
Prototype
Proof of Concept
```

---

# 143. FINAL ACCEPTANCE

最终必须能够验证：

## Reader

```text
[ ] EPUB
[ ] TXT
[ ] PDF
[ ] Pagination
[ ] Scroll
[ ] TOC
[ ] Search
[ ] Progress
[ ] Bookmark
[ ] Annotation
[ ] Notes
```

## Text Enhancement

```text
[ ] Chapter Detection
[ ] Text Repair
[ ] Smart Coloring
[ ] Simplified/Traditional
[ ] Dictionary
[ ] Translation
```

## AI

```text
[ ] Cloud AI
[ ] Local AI
[ ] Streaming
[ ] RAG
[ ] Citation
[ ] AI Repair
[ ] Diff
[ ] Summary
[ ] Characters
[ ] Knowledge Graph
```

## TTS

```text
[ ] System TTS
[ ] Cloud TTS
[ ] Multi Character
[ ] Audiobook
```

## Learning

```text
[ ] Flashcards
[ ] Quiz
[ ] Review
[ ] Mistake Book
```

## Sync

```text
[ ] Account
[ ] Login
[ ] Device
[ ] Sync
[ ] Conflict
[ ] Backup
[ ] Restore
[ ] WebDAV
```

## Platform

```text
[ ] macOS
[ ] Windows
[ ] Linux
[ ] Android
[ ] iOS
```

---

# 144. AGENT EXECUTION PROTOCOL

现在开始执行。

## STEP 1 — REPOSITORY RECON

首先扫描：

```text
.
package.json
pnpm-lock.yaml
Cargo.toml
src/
src-tauri/
packages/
apps/
tests/
docs/
```

如果目录不存在：

> 不要报错，记录为项目当前状态。

---

# STEP 2 — ARCHITECTURE REPORT

不要立即写业务代码。

先输出：

```text
Architecture Report
```

必须包含：

```text
Current Architecture
Current Dependencies
Current Features
Missing Features
Technical Debt
Risks
Domain Model
Module Boundaries
IPC
Events
Storage
Reader Engine
AI
RAG
Sync
Security
Testing
```

---

# STEP 3 — IMPLEMENT PHASE 0

完成：

```text
Foundation
Protocol
Error
Event
Domain
Storage abstraction
Testing
```

---

# STEP 4 — VALIDATE

执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cargo check
cargo test
```

失败：

> 修复。

不能跳过。

---

# STEP 5 — CONTINUE SPRINT

完成当前 Sprint 后：

```text
Review
Test
Document
```

再进入下一 Sprint。

---

# 145. AGENT OUTPUT FORMAT

每完成一个 Sprint：

```text
# Sprint Report

## Goal

## Completed

## Changed Files

## Architecture Changes

## Protocol Changes

## Database Changes

## Tests

## Performance

## Security

## Known Issues

## Technical Debt

## Next Sprint
```

---

# 146. WHEN BLOCKED

遇到任何无法确定的问题：

不要猜。

输出：

```text
Problem
Evidence
Options
Recommendation
Tradeoffs
```

如果存在安全、数据损坏或架构风险：

> 优先停止该局部实现并处理风险。

---

# 147. WHEN EXISTING CODE CONFLICTS

如果当前 Repository 与本文档冲突：

不要直接删除。

必须：

```text
Inspect
Compare
Assess
Plan Migration
Implement Incrementally
```

禁止：

> 为了满足新架构而无理由重写整个项目。

---

# 148. WHEN REQUIREMENTS CONFLICT

优先级：

```text
Security
>
Data Integrity
>
Reader Stability
>
Architecture
>
Performance
>
UX
>
Feature Completeness
>
Visual Polish
```

---

# 149. FINAL RULE

始终牢记：

```text
Do not optimize for lines of code.

Optimize for architecture.

Do not optimize for feature count.

Optimize for user experience.

Do not optimize for demo speed.

Optimize for long-term maintainability.

Do not fake capabilities.

Do not hide limitations.

Do not bypass tests.

Do not bypass types.

Do not bypass security.

Do not destroy original user data.
```

---

# 150. FINAL PRODUCT VISION

最终不是简单做：

> 一个电子书阅读器。

而是构建：

# Personal Reading OS

```text
                    Personal Reading OS
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
       Reading               AI              Knowledge
          │                   │                   │
     EPUB / PDF / TXT      RAG / LLM          Notes
     Themes                AI Repair          Graph
     Annotation            Summary            Flashcards
     Dictionary            Translation        Review
     TTS                   Characters         Learning
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                         Local First
                              │
                    ┌─────────┴─────────┐
                    │                   │
                  Local               Cloud
                    │                   │
                 SQLite              Sync API
                 Local AI            WebDAV
                 Local RAG           Backup
                    │                   │
                    └─────────┬─────────┘
                              │
                           Tauri 2
                              │
                             Rust
```

最终产品必须同时具备：

> **专业阅读器的稳定性**

> **ColorTxt 的文本增强能力**

> **Readest 级跨平台阅读体验与同步能力**

> **现代 AI 阅读助手**

> **Local-first AI 能力**

> **知识管理与学习能力**

> **Apple-inspired Liquid Glass 高品质 UI**

最终目标：

> **成为一个真正可以长期使用、长期迭代、长期维护的下一代个人 AI 阅读操作系统。**

---

# END OF SPECIFICATION
