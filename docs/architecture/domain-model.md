# Domain Model

> Phase 0:定义核心实体形状与不变量。持久化在 Sprint 3 落地;本文档随 Domain 落地逐节补"已实现"标记。

## 基础约定

- 所有实体继承 `EntityBase`(`@reader/shared`):`id`、`createdAt`、`updatedAt`、`version`(乐观并发)。
- 时间统一 ISO 8601 UTC 字符串(`ISO8601`)。
- `id` 为稳定字符串(生成策略 Sprint 3 定:ULID/UUIDv7 倾向)。

## Book / Library(Sprint 3、5)

```ts
Book        { id, sourceId, metadata, cover, format, size, hash, status } + EntityBase
BookMetadata{ title, subtitle?, authors[], publisher?, language?, description?, isbn?, subjects[], cover? }
Chapter     { id, bookId, index, title, href?, parentId?, level }
Collection  { id, name, bookIds[] } + EntityBase
Tag         { id, name } + EntityBase
```

不变量:`Book.format` ∈ 已真实验证的格式白名单(禁止声明式支持,spec §9);`hash` 用于导入去重与版本一致性判断。

## Reader(Sprint 4、6)

```ts
ReadingLocation { cfi?, href?, progress, page? }   // 统一抽象,跨格式/跨模式
Bookmark        { id, bookId, location, title?, note? } + EntityBase
Annotation      { id, bookId, range: TextRange, selectedText, color, note? } + EntityBase
ReadingSession  { id, bookId, startedAt, endedAt?, duration, startLocation, endLocation } + EntityBase
ReaderSettings  { typography, layout, background, reading }  // 持久化 + 可同步
```

不变量:`progress ∈ [0,1]`;翻页/滚动模式切换必须保持 location、annotation、bookmark 一致(spec §8)。

## AI(Phase 3、4)

```ts
AIConversation { id, bookId?, title, model, provider, messages[] } + EntityBase
AIMessage      { id, conversationId, role, content, citations[], model } + EntityBase
AITask         { id, type, status: pending|running|paused|completed|failed|cancelled,
                 progress, input, output?, error?, cancellable } + EntityBase
```

不变量:AI 输出必须经 Schema 校验 + 业务校验 + 人工审核后才可持久化(spec §118);引用(citation)必须带章节/位置,无来源必须标记为推测(spec §33)。

## AI Book Processing(Phase 4)

```ts
BookVersion    { id, bookId, index, label, sourceVersionId?, createdAt }  // Original 不可变
DiffEntry      { id, type: added|removed|modified|moved, location, before?, after?, status: pending|accepted|rejected|edited }
```

不变量:原书文件永不覆盖;任何 AI 修改走 Candidate → Diff Review → Apply → New Version(spec §19)。

## Learning / Character(Phase 4、5)

```ts
Character  { id, bookId, name, aliases[], personality?, appearance?, relationships[], importantEvents[], quotes[], tags[], image?, voice? } + EntityBase
Flashcard  { id, bookId, conceptId?, front, back, srs { stage, dueAt } } + EntityBase
QuizItem   { id, bookId, type: choice|blank|short|essay, stem, options?, answer, explanation? } + EntityBase
```

## Sync(Phase 6)

```ts
SyncRecord   { id, entityType, entityId, operation, version, updatedAt, deviceId }
SyncConflict { id, entityType, entityId, localVersion, remoteVersion, resolution? }
```

不变量:同步队列本地优先;冲突不可自动消解时必须进入 Conflict Resolver UI(spec §52)。

## 值对象(已实现于 `@reader/shared`)

- `ISO8601` + `ISO8601_PATTERN`(协议层校验)
- `JsonValue` / `JsonRecord`(错误 context、元数据)
- `AppErrorPayload`(错误 wire 格式)
