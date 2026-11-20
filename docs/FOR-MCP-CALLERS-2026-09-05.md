# 給用 StarUML MCP 的你：三個行為變了

日期：2026-09-05

你透過 StarUML MCP 呼叫這個 controller。這一輪有三個工具的行為變了，其中一個會讓你之前擺過的邊標籤位置是錯的，需要重寫。**都不必重啟 MCP 客戶端** —— 沒有任何參數 schema 改動。

先看要不要動手：

| 工具 | 變化 | 你要做什麼 |
|---|---|---|
| `view_update` | 寫邊標籤的 `left`／`top` 以前會偏掉半個標籤，現在精確 | 之前擺過邊標籤而沒回頭核對落點的，重寫一次 |
| `element_create_child` | 建 `UMLInputPin`／`UMLOutputPin` 從假成功變成明確失敗 | 建過 Pin 的流程要重看 —— 那些 Pin 從來就不存在 |
| `seq_get_message` | 開始回 `messageIndex` 與 `messageCount` | 不必再從寫入的回應裡撈訊息位置 |

每一條技術陳述的出處見附錄。

---

## `view_update` 擺邊標籤：之前偏掉半個標籤

你要求 `left: 900, top: 40`，標籤實際落在 866／34。差的正好是那個標籤的半寬與半高。

原因是換算需要標籤的尺寸，而剛建立的標籤還沒有尺寸。一個邊標籤的寬度就是它文字的寬度，要等 StarUML 畫過一次、用 canvas 量過文字才知道 —— 在那之前 controller 讀到的寬度不存在，當成 0，換算等於沒做。StarUML 隨後重排時減的卻是量測後的真實半寬，於是標籤就短了那麼多。

現在 controller 在尺寸還不存在的時候先畫一次圖，再換算。同一個請求在實機上精確落在 900／40，存檔之後也在。

**你該怎麼處理已經擺過的標籤**：如果你在建立關聯之後立刻用 `view_update` 擺它的標籤，那次的落點是錯的，重寫一次就好。如果你擺的標籤已經被畫過（例如你先讀過它的 `width` 拿到非零值，或那張圖已經開過），那次本來就是對的，不受影響。

順帶一件反直覺的事：沒有名稱的關聯，它的標籤畫過無數次，`width` 仍然是 0，因為沒有文字可以量。所以「`width` 是 0」不代表「還沒畫過」。

## `element_create_child` 建 Pin：以前騙你，現在說實話

`element_create_child` 建 `UMLInputPin` 或 `UMLOutputPin`，現在回失敗，訊息長這樣：

```
StarUML created no element for type "UMLInputPin" in field "inputs" of UMLAction.
The type may not be registered with the model factory.
```

**這不是新增的限制。** StarUML 的模型工廠從來沒有註冊過這兩個型別，所以它從來沒有真的建出東西來。變的是 controller 以前回 `success: true`，還交給你一個 repository 從沒登記過的元素。所以：**如果你的流程建過 Pin 而且以為成功了，那些 Pin 不存在，圖上也沒有，`.mdj` 裡也沒有。**

範圍是查清楚的，不是抽樣。controller 的子元素型別對照表有 43 個型別，StarUML 的 `registerModelFn` 註冊了 90 個，兩邊對過之後只有這兩個 Pin 沒註冊。其餘 41 個照舊。

## `seq_get_message` 開始回訊息在清單裡的位置

`seq_get_message` 現在回 `messageIndex` 與 `messageCount`，跟 `seq_create_message`、`seq_update_message` 一樣。之前只有後兩個會回，而 README 卻寫 GET 也會回 —— 照那句文件寫的程式會拿到 `undefined`。

你要比較兩則訊息的先後，現在兩次 GET 就夠了。

## 順帶一個確認：寫 `y` 真的會重排訊息清單

`seq_update_message` 寫 `y` 之後，`interaction.messages` 會跟著依 y 重新排序。這件事一直寫在文件裡，但直到這一輪才有實機證據 —— 該驗它的測試在讀一個 GET 不回的欄位，所以從來沒真的跑起來。

實測：建兩則訊息，把第二則移到第一則上面，它在 `interaction.messages` 裡就排到前面。所以你不需要再用 `element_reorder` 一步一步搬。

## 還沒驗的一件事

寫邊標籤位置時，`clamped` 會不會把偏掉的距離報出來，這一輪沒有檢查。缺陷修好之後這一題不會再出現，但如果你依賴 `clamped` 判斷邊標籤是否精確寫入，那個行為沒有被驗證過。

## 這些說法有多硬

三個變更都在 StarUML 6 的真引擎上跑過，不是只有離線測試。同一天跑了兩輪：

| | 缺口檢查 | 端點套件 |
|---|---|---|
| 第一輪（修正前） | 71 過 4 敗 | 426 過 2 敗 |
| 第二輪（修正後） | 75 過 0 敗 | 428 過 0 敗 |

第一輪那 4 敗就是上面講的問題被抓到的地方。第二輪的 428／0 跟這一輪之前的成績是同一個數字，但這一次裡面沒有那兩個 Pin 的假成功 —— 它們現在是「如預期被拒」才算通過。

---

## 附錄：出處

**第一手：實機兩輪的完整紀錄**
`test/GAP-VERIFICATION.md` 的 Run 4 與 Run 5 —— 每個失敗的實際數值、歸因、以及第二輪的結果。標籤那條的算式對照（有尺寸該落 900／40、沒尺寸該落 865／34、實機 866／34）也在裡面。

**第一手：這一輪十三條缺口的完整說明**
`docs/GAP-REPORT-REPLY-2026-09-05.md`。這份只講對 MCP 呼叫端有影響的三件事，那份講全部十三條，包含 A-2 一開始被歸錯原因、後來訂正的紀錄。

**第一手：工具名**
從 `staruml-controller-mcp-core` 的建置產物列出，不是從文件抄的：`view_update` → `PUT /api/views/:id`、`element_create_child` → `POST /api/elements/:id/children`、`seq_get_message` → `GET /api/seq/messages/:id`、`element_reorder` → `PUT /api/elements/:id/reorder`。

**第一手：Pin 型別沒註冊**
`/Applications/StarUML.app/Contents/Resources/app.asar` 解成 UTF-8 之後，`registerModelFn` 的 90 個型別裡沒有任何一個含 "Pin"。對照的另一邊是 `api-handler.js` 的 `CHILD_TYPE_DEFAULT_FIELDS`，43 個型別。

**第一手：標籤尺寸的機制**
同一個 `app.asar`：`class View` 的建構式（字元位移 23646704）不指派 `width` 與 `height`；`LabelView.arrange`（23693980）用 `canvas.textExtent` 量文字之後才填。重繪的入口是 `repaint()`（2214580），它做 `drawBackground` 之後呼叫 `diagram.drawDiagram(canvas)`。

**待確認**
`clamped` 在邊標籤上的回報行為（見上一節）。
