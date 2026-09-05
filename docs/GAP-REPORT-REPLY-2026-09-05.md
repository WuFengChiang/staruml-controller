# 回覆 YC_POS_SYS 的 controller 缺口清單

日期：2026-09-05　　回覆對象：YC_POS_SYS 那一側（來信說模型檔在你們的 `spec/佑全新POS.mdj`，我這邊沒有那個檔）
本次改動的分支：`integration/session-work`（尚未 commit）

A 級四條、B 級三條、C 級五條全部處理完，D 級查出確切機制但同程序內無解。
下面先講三件你們的判斷需要修正的事，因為它們會改變你們接下來怎麼做；再逐項講改了什麼、怎麼呼叫、怎麼驗收。

**每一條技術陳述的出處見附錄 A。**「idx」是 StarUML 6 的 `app.asar` 解成 UTF-8 之後的字元位移，可以直接重讀那段原始碼。

---

## 一、先修正三件事

### 1. 關聯端點的 reference 不是「技術上不可設」

你們寫「若技術上真的不可設，至少把 success 改成 false」。實際上它一直可設，是 controller 沒開這個欄位。

StarUML 的中繼模型 (metamodel) 把 `RelationshipEnd.reference` 標成 `readOnly: true`，但那個旗標只管屬性編輯器要不要讓人打字。`Engine.setProperty` 根本不讀它。而且在畫布上拖曳關聯端點時，StarUML 自己走的 `Engine.reconnectEdge` 就是這樣寫的：對 `UndirectedRelationship` 直接 `fieldAssign(edge.model.end1, "reference", 新元素)`。

所以那三次刪除重建是不必要的成本。現在 `end1.reference` 與 `end2.reference` 可以直接寫，詳見第二節 A-1。

### 2. 手動拖曳的標籤位置**有**存起來

你們寫「一旦碰了 alpha／distance，下一次重算會把前人手動拖曳的位置沖掉，而手動位置沒有留在任何欄位裡，回不去」。後半句不成立。

人在畫布上拖一個邊標籤，走的是 `ParasiticManipulator.endManipulate`：它拿放開滑鼠的位置，用 `Coord.getPolar` 反算出 alpha 與 distance，再交給 `Engine.moveParasiticView` 寫進去。也就是說**手動位置就是存在 alpha／distance 這兩個欄位裡**，跟 API 寫進去的是同一組數字。

會被沖掉是真的，但原因是「你寫了新的一組」，不是「舊的沒被存下來」——就像再拖一次會蓋掉前一次一樣。想保留就先讀回 alpha／distance 存著。

### 3. undo 有涵蓋 API 的寫入

你們寫「undo 不涵蓋 HTTP API 做的 view_update」。它涵蓋。這個 API 的每一次寫入都經過 `app.engine`，而 `Engine.setProperty` 會建一個 operation 交給 `Repository.doOperation`，後者把它推上 undo 堆疊。

你們看到「連敲五次 undo，四個欄位一個都沒還原」，最可能的解釋是那四個欄位是 A-2 那些**根本沒寫進去**的 `left`／`top`——沒寫進去就沒有東西可以還原。至於為什麼五次都回 `success: true`：`Repository.undo()` 在堆疊空的時候安靜地什麼都不做，而 StarUML 沒有 `canUndo()` 可以先問。這一點確實該修，見 A-4。

---

## 二、逐項

### A-1　關聯端點可以搬，不必刪掉重建

`end1` 與 `end2` 現在收 `reference`，值是新元素的 id：

```bash
curl -X PUT "http://localhost:12345/api/class/associations/$ASSOC_ID" \
  -H 'Content-Type: application/json' \
  -d '{"end2":{"reference":"'"$NEW_CLASS_ID"'"}}'
```

關聯的 `_id` 不變，圖上的視圖也不會消失。欄位名用 `reference` 是為了跟讀取端一致——`GET` 回來的 `end1` 就長這樣；`referenceId` 當別名也收，兩個一起送會被拒絕。

模型改完之後，**每一張圖上的視圖都會跟著搬**。那張圖上已經有新元素的視圖，邊就重新接過去並清掉舊的轉折點；那張圖上沒有新元素的視圖，就接不過去——一條邊視圖需要同一張圖上的節點視圖才能附著。這種情況不會讓整個請求失敗，而是照實回報：

```json
{
  "success": true,
  "message": "Updated association (fields: end2.reference) — IGNORED: end2.view[Overview] ...",
  "ignored": [{
    "field": "end2.view[Overview]",
    "reason": "\"NewTarget\" has no view on this diagram, so it still draws the old endpoint. Add a view of the new element to that diagram, then call PUT /api/views/<id>/reconnect"
  }]
}
```

這時模型是對的，只有那一張圖落後。整個拒絕的話，你們就又得回去刪掉重建，那正是這條要消除的成本。

另外加了一道 UML 檢查：metamodel 宣告的型別是 `Model`，所以引擎會樂意讓一條關聯指向一個套件 (package)。`UMLAssociation` 的端點不是 `UMLClassifier` 就會被拒絕。

### A-2　邊標籤的 left／top 可以直接寫，不必再靠匯出觸發重繪

一個邊標籤不存自己的位置。StarUML 每次重排都從 `alpha`（相對錨點的角度）與 `distance`（偏移量）重算 `left`／`top`，所以直接指派 `left`／`top` 才會被下一次重繪蓋掉。

現在 `PUT /api/views/:id` 收 `left`／`top`，並且用**跟滑鼠拖曳完全相同的算式**換算：

```bash
curl -X PUT "http://localhost:12345/api/views/$LABEL_VIEW_ID" \
  -H 'Content-Type: application/json' \
  -d '{"left":900,"top":40}'
```

請求走 StarUML 自己的 `Engine.moveParasiticView`：它設定 alpha／distance，接著**畫一次圖**讓重排算出 `left`／`top`，然後把四個欄位當成一個可還原的操作記下來。所以重算後的座標會進到模型裡，存檔之後也會在 `.mdj` 裡——**不再需要拿 `diagram_export` 當副作用去逼它重繪**。

標籤所在的圖如果不是編輯器正開著的那一張，這次繪製會走 StarUML 的隱藏編輯器 (hidden editor)，畫面上不會有任何變化。這是 StarUML 自己的版面外掛在用的做法。

重排會做兩次 `Math.floor`，所以要求 900 有可能停在 899。那一像素會如實回報在 `clamped` 裡，不會被四捨五入成「寫進去了」。

`alpha`／`distance` 照舊可用，而且照舊是 StarUML 真正存的那兩個數字。

### A-3　子元素寫到不存在的容器欄位，現在會擋下來

`element_create_child` 建 `UMLConstraint` 靜默失敗的根因查到了，是預設欄位表填錯：

`CHILD_TYPE_DEFAULT_FIELDS['UMLConstraint']` 原本填 `'constraints'`，但**整個 metamodel 裡只有 `SysMLBlock` 有 `constraints` 這個屬性，而且裝的是 `SysMLProperty`**。一般 UML 元素沒有這個集合，`UMLConstraint` 該進通用的 `ownedElements`。

失敗為什麼是靜默的，鏈條是這樣：`Factory.defaultModelFn` 呼叫 `engine.addModel(parent, field, model)`，而 `addModel` 在 `parent[field]` 不是陣列的時候什麼都不做；接著它 `repository.get(model._id)` 想把元素讀回來，但那個元素從來沒被登記進 repository，於是回傳 undefined。這就是你們看到的 `data: null`。

三處都改了：

1. 預設欄位改成 `ownedElements`。
2. 建立之前先檢查 `Array.isArray(parent[field])`，不是就拒絕，並在錯誤訊息裡列出這個 parent 真正有哪些集合。
3. 建立之後檢查元素真的存在、而且真的在那個集合裡，否則回 `success: false`。

回應現在也會帶 `data.field`，告訴你它用了哪個欄位。

**這一條順手掃了全表**（29 個項目對 metamodel 逐一驗證），另外找到兩個同樣錯的：

| 子型別 | 原本填的欄位 | 問題 | 改成 |
|---|---|---|---|
| `UMLConstraint` | `constraints` | 只有 SysMLBlock 有，且裝 SysMLProperty | `ownedElements` |
| `UMLPort` | `ports` | 只有 SysMLBlock 有，且裝 SysMLPort | `attributes`（UMLPort 繼承自 UMLAttribute） |
| `SysMLOperation` | `operations` | **這個類別在 metamodel 裡不存在**，只有 `registerModelFn` 註冊了名字 | 從允許清單移除 |

另外補上 `SysMLPort` → `ports`，讓 `ports` 留在容器欄位清單裡。

至於你們提到「`diagram_create_view_of` 對泛化線也回 `data: null`，但實際上建成功了」——那是另一條路徑，這一輪沒有動它。列在第四節。

### A-4　undo 會說有沒有真的還原

現在會在動作前後讀 `_undoStack` 的深度。堆疊是空的就回 `success: false` 加 `Nothing to undo`；深度沒有變小就回 `success: false` 並報出深度；成功就告訴你還剩幾步：

```json
{
  "success": true,
  "message": "Undo executed (12 operation(s) left to undo)",
  "data": { "stackSizeBefore": 13, "stackSizeAfter": 12 }
}
```

`POST /api/redo` 同樣處理。

### B-1　訊息可以指向它呼叫的方法

`signature` 收 UMLOperation 或 UMLSignal 的 id，`signatureId` 是同一個欄位的別名，`null` 清除。欄位名用 `signature` 一樣是為了跟讀取端一致。

```bash
curl -X PUT "http://localhost:12345/api/seq/messages/$MSG_ID" \
  -H 'Content-Type: application/json' \
  -d '{"signature":"'"$OPERATION_ID"'","arguments":"orderId"}'
```

型別檢查比 metamodel 嚴：metamodel 宣告的是 `UMLModelElement`（什麼都收），但 UML 2.5.1 只允許 Operation 或 Signal。把訊息指向一個類別滿足不了任何 UML 規則，只會看起來像有追溯性。

讀回來會多三個欄位，讓你們不必再去抓那個 operation 就能檢查你們引用的兩條規則：`signatureName`（比對 `signature_refer_to` 要求的名稱相等）、`signatureParameterCount`（比對 `signature_is_operation_request` 要求的引數個數，已排除 `direction: return` 的參數）、`signatureOwnerName`（那個方法屬於哪個類別）。

同一輪也開放了 `UMLMessage` 其餘的欄位——`arguments`、`guard`、`sequenceNumber`、`iteration`、`assignmentTarget`、`isConcurrentIteration`。**其中只有 `arguments` 是你們要求的範圍內**（引數個數那條規則要用到），其他五個是同一個機制上的順手補齊，你們用不到可以忽略。

你們對程式碼產生的判斷是對的，我確認了一次：Java 與 C# 外掛讀的是 UMLOperation 加 UMLParameter，不讀 `Message.signature`。設了它是恢復追溯性，不影響產生出來的程式碼。

### B-2　UMLConstraint 的 specification 可以寫了

`PUT /api/elements/:id` 收 `specification`，只對 UMLConstraint 開放，其他型別會被明確拒絕。建立的時候也可以一起給：

```bash
curl -X POST "http://localhost:12345/api/elements/$CLASS_ID/children" \
  -H 'Content-Type: application/json' \
  -d '{"type":"UMLConstraint","name":"paymentChoice","specification":"{xor}"}'
```

### B-3　constrainedElements —— 已探測，可以設

**欄位存在**：`UMLConstraint.constrainedElements`，`kind: refs`，元素型別 `UMLModelElement`（idx 58811993）。**現在可以設**：

```bash
curl -X PUT "http://localhost:12345/api/elements/$CONSTRAINT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"constrainedElementIds":["'"$ASSOC_A"'","'"$ASSOC_B"'"]}'
```

這是整批取代，不是附加。所有 id 會在寫入之前先全部解析完，所以清單中間有一個打錯字不會留下改到一半的約束。讀回來是 `constrainedElementIds` 與 `constrainedElementNames`。

實作上有一個坑值得寫下來，因為它正是你們最在意的那種靜默失敗：**不能用 `setProperty` 指派整個陣列**。`Repository._applyOperation` 處理 `FIELD_ASSIGN` 的時候，只有在值是「單一個有 `_id` 的元素」時才會更新反向參照索引；丟一個陣列進去，值會被指派，但索引不會更新，於是 `getRefsTo()` 找不到這些成員——刪除元素時的完整性檢查就是靠它。所以這裡走的是 `engine.addItem` 與 `removeItem`，它們用 `FIELD_INSERT`／`FIELD_REMOVE`，會維護索引。

這樣一來，八條組合線屬於同一個互斥群就是結構化表達了：一個 `UMLConstraint`，`specification` 寫 `{xor}`，`constrainedElements` 指向那八條。

### C-1　名稱可以清成空字串

`PUT /api/elements/:id` 的 `name` 現在收空字串。這個端點對任何元素都有效，包含關聯本身與關聯端點，所以清掉一個自動產生的關聯名只要一次呼叫。

其他端點沒有動。建立路徑照舊要求非空（一個沒有名字的新元素通常是打錯字），型別專屬的更新端點（`PUT /api/class/classes/:id` 之類）也照舊。要清名稱就走 `PUT /api/elements/:id`。

### C-2　`type` 與 `typeName` 現在兩邊都通

`PUT /api/elements/:id` 現在也收 `type`，跟 `typeName` 寫同一個屬性。兩個一起送會被拒絕，不會自己挑一個。

讀取端本來就三個都吐（`type`、`typeId`、`typeName`），現在通用的 `serializeElement` 也補上了 `type`。所以那份「24 個屬性全部失敗」的假清單，不管腳本讀哪一個名字都不會再發生。

有一個地方**故意**不做別名：`POST /api/elements/:id/children` 的 `type` 指的是「要建立哪一種元素類別」（`UMLParameter`），而 `typeName`／`typeId` 指的是「這個元素的型別是什麼」（`Money`）。兩者意思不同，那裡兩個都保留、不互為別名。

### C-3　可以只建模型元素，不決定畫在哪張圖

`POST /api/elements/:id/children` 現在收分類器 (classifier) 與套件：`UMLClass`、`UMLInterface`、`UMLEnumeration`、`UMLDataType`、`UMLPrimitiveType`、`UMLSignal`、`UMLActor`、`UMLUseCase`、`UMLComponent`、`UMLNode`、`UMLArtifact`、`UMLCollaboration`、`UMLPackage`、`UMLModel`、`UMLSubsystem`。

```bash
curl -X POST "http://localhost:12345/api/elements/$PACKAGE_ID/children" \
  -H 'Content-Type: application/json' \
  -d '{"type":"UMLClass","name":"Receipt"}'
```

建出來只有模型元素，一張圖都不畫。之後要畫再用 `POST /api/diagrams/:id/views`，想畫幾張畫幾張，或一張都不畫。

### C-4　循序圖的版面：找到確切機制了，layout 直接擋掉

你們把「diagram_layout 會摧毀循序圖版面」列成事實、把訊息亂序列成推測。兩件事其實是同一個根因的兩面，而且都查證到原始碼了。

**layout 為什麼會毀掉版面**——不是版面演算法不適合，是 `UMLSequenceDiagram.layout()` 根本是個空的 stub（原始碼裡寫著 `// TODO: Layout for Sequence Diagram`），什麼版面都沒有排。毀掉版面的是 `Engine.layoutDiagram` 自己的記帳方式：

1. 它把 `diagram.ownedViews[i]` 拍成快照存進 `mementoArray[i]`
2. 它呼叫 `editor.repaint()`，而 `UMLSequenceDiagram.drawDiagram()` 會跑 `regulateSequenceNumber()`，**這個函式會把 `ownedViews` 重新排序**
3. 它再拿 `diagram.ownedViews[i]` 跟 `mementoArray[i]` 比對差異並套用

重新排序之後，索引 `i` 已經是另一個視圖了。於是每個視圖都跟別人的快照比對，然後被套上別人的幾何。沒有任何 direction 或 separations 參數躲得掉這件事。

所以 `POST /api/diagrams/:id/layout` 對 `UMLSequenceDiagram` 直接拒絕，錯誤訊息裡寫明理由並指向正確做法。沒有 `force` 開關——一個保證會弄壞圖的開關不該存在。

**訊息編號為什麼會亂序**——`regulateSequenceNumber()` 就是那個把 `interaction.messages` 依 y 重新排序的函式，而它只在圖被畫出來的時候跑。API 寫完 y 之後不會有人去畫那張圖，所以清單維持原樣。

現在 `PUT /api/seq/messages/:id` 寫完 `y` 之後會畫一次圖，回應也帶上 `messageIndex` 與 `messageCount`。建立訊息時也一樣。所以不用再一步一步 `element_reorder` 了。

### C-5　MCP schema 落後：機制跟你們想的不同

先講結論：**這一項在另一個 repo，這一輪沒有動**。路徑是 `/Users/wuufone/Desktop/drawer/MyProjects/staruml-mcp-servers/`。

但你們的推測要修正。落後的原因不是「要等伺服器重啟才跟上」，而是**那些 schema 是手寫的第二份副本**。那個 repo 的 `staruml-controller-mcp-core/src/tools/` 下面是一堆手寫的 TypeScript，把 controller 的欄位清單抄了一遍。例如 `/Users/wuufone/Desktop/drawer/MyProjects/staruml-mcp-servers/staruml-controller-mcp-core/src/tools/elements.ts` 裡的 `ALLOWED_CHILD_TYPES` 就是逐字複製，到現在還留著已經被我移除的 `SysMLOperation`。每個 family 的套件各自編譯出自己的 `dist`，MCP 客戶端載入的是編譯結果，不是原始碼。

所以同步一次要做三件事：改 TypeScript、重新 build、重啟 MCP 客戶端。不改 TypeScript 的話，重啟幾次都不會跟上。

為了讓這件事有機會自動化，我在 `GET /api/status/capabilities` 加了 `writableFields`，直接從 handler 拿來驗證的同一組常數讀出來：

```json
{
  "writableFields": {
    "PUT /api/elements/:id": ["name", "stereotype", "documentation", "referenceId",
                              "typeId", "typeName", "type", "direction",
                              "specification", "constrainedElementIds"],
    "PUT /api/seq/messages/:id": ["...", "signature", "signatureId", "arguments", "..."],
    "relation end (end1/end2)": ["name", "navigable", "aggregation", "multiplicity",
                                 "reference", "referenceId"]
  }
}
```

MCP 那邊要不要改成從這裡產生，等你們回覆。**在那之前，這一輪新增的欄位只能走 HTTP，MCP 工具碰不到。**

### D　伺服器沒有回應：機制查證屬實，同程序內無解

你們把「主執行緒被模態對話框擋住」列成推測。這個推測是對的，而且機制可以指到原始碼。

HTTP 伺服器跑在 StarUML 的算繪程序 (renderer) 的 JavaScript 執行緒上，跟畫圖是同一條。原生的模態對話框會擋住這條執行緒。具體到程式碼：`app.dialogs.showErrorDialog(message)` 的實作是 `ipcRenderer.sendSync("show-error-box", message)`，`sendSync` 依設計就是同步阻塞，會一路擋到主程序回覆為止——而主程序在等人按確定。這段期間伺服器接得到連線、回不了任何東西，`GET /api/status` 也一樣。從呼叫端看，這跟當掉分不出來。

你們希望 `GET /api/status` 能獨立於主執行緒回應。做不到：擴充功能只能跑在那條執行緒上，沒有第二條可以用。至於「回應裡帶一個目前有模態對話框開著的狀態」，更做不到——能回應就表示沒有對話框擋著；而 StarUML 自己因為別的理由開的對話框（例如檔案在磁碟上被改過、未存檔提示），從擴充功能這邊觀察不到。

**能做的是保證沒有任何請求路徑會叫出對話框。我稽核過了**：整個擴充功能只有四處呼叫對話框，全部在 `main.js`，全部掛在「啟動伺服器」與「停止伺服器」兩個選單指令上，沒有一處走得到 HTTP。其中三處是 `showErrorDialog`（會阻塞），一處是 `showInputDialog`（用 bootstrap 模態，不阻塞 JavaScript 執行緒）。

所以症狀出現時，唯一可靠的判斷方式還是去看螢幕。這是現況，不是修好了。

---

## 三、怎麼驗收

你們說「每一條補完之後，寫入之後讀回，而且要確認 `save_project` 之後真的落進 `.mdj`」。這條要求已經寫進測試裡。

`test/verify_gaps_live.py` 新增的段落做的就是你們會做的事：呼叫 API 寫入 → 讀回 → `POST /api/project/save` → 用 `json.load` 讀那個 `.mdj` → 在樹裡找到那個 `_id` 的節點 → 斷言欄位。涵蓋 A-1（`end2.reference` 存成 `$ref`）、A-2（`left`／`top` 存進檔案，不只 alpha／distance）、B-1（`signature` 存成 `$ref`、`arguments` 存成字串）、B-2、B-3（`constrainedElements` 存成 `$ref` 陣列）。

跑法（**一定要走 runner，它會先切到空專案並用 EXIT trap 還原原本的專案**）：

```bash
bash test/run_integration_safely.sh
```

runner 現在也會先確認載入的是這一版：問 `GET /api/status/capabilities`，看 `PUT /api/elements/:id` 收不收 `specification`。舊版一律直接中止並告訴你要重開 StarUML。

離線測試 `node test/test_offline_units.js` 目前 **132 項全過**（原本 80 項，這一輪新增 52 項）。它跑的是同一個 `route()` 入口，對著 mock 執行環境。**它證明的是 controller 自己的邏輯，證明不了 StarUML 引擎的行為**——只有一個例外：A-2 的座標換算。mock 裡照抄了 StarUML 真正的 `Coord.getPointAwayLine` 與 `EdgeParasiticView.arrangeObject`（從 `app.asar` 移植），而 controller 寫的是它們的反函式，所以一趟來回落在原點就證明反函式是對的。

---

### 既有的 428 呼叫測試套件會不會被改壞

不會。這一輪改了四個既有行為，我逐一對 `test/test_all_endpoints.sh` 查過：

- 第 126 項 `gen_layout_diagram` 打的是 `UMLClassDiagram`，不在拒絕之列。
- 第 127／128 項的 undo／redo 跑在一百多次寫入之後，堆疊不是空的，照舊回 `success: true`。
- 整份套件沒有任何一處用 `/children` 建 `SysMLOperation`，也沒有寫 `alpha`／`distance`。
- `handlers/family-composite.js` 的 `ports` 是一個**資源** (resource) 端點（列出 UMLPort），不是走 `field: 'ports'` 的子元素建立路徑，所以不受影響。`handlers/family-sysml.js` 的 operations 子元素用的是 `UMLOperation`，不是 `SysMLOperation`。

這是靜態比對，不是實際跑過。實機那一輪見下一節。

---

## 四、沒做的

- **`diagram_create_view_of` 對泛化線回 `data: null`。** 你們提到它建成功了但回 null。這是 `createRelationView` 那條路徑，跟 A-3 的 `createChildElement` 不同，這一輪沒有動。要處理的話請單獨提，或告訴我這一條的優先序。
- **MCP schema 同步。** 見 C-5，在另一個 repo，等你們決定。
- **`UMLSlot` 的型別設不了，而且拒絕的理由原本寫錯。** 這是我在核對 README 的時候發現的，不在你們的清單裡。`checkFeatureFieldsSupported` 用 `instanceof UMLStructuralFeature` 當閘門，而 `UMLSlot` 繼承自 `UMLModelElement`，所以被擋掉——但 metamodel 明明給了它一個 `type`（`kind: var`，`UMLClassifier`，idx 58817287）。也就是說這是過嚴的拒絕，不是欄位不存在。README 原本寫「UMLSlot has no type property」，已經訂正並留下訂正紀錄。行為本身沒有動，因為沒有人要求，而放寬會改變既有語意。要的話請開一條。
- **實機驗證還沒跑。** 這一輪的所有結論分成兩層：程式碼機制的部分有 `app.asar` 的出處，是查證過的；「寫進去了而且存得下來」的部分只有離線測試撐著，**實機那一輪還沒跑**。跑 `run_integration_safely.sh` 需要 StarUML 開著、伺服器啟動、而且擴充功能重新載入成這一版。這件事得在你們這邊或我這邊實際做一次，做完我會把結果補進 `test/GAP-VERIFICATION.md`。在那之前，A-1 到 B-3 的實機行為請當成**待確認**。

---

## 附錄 A：出處

### 第一手：StarUML 6 的 `app.asar`

路徑 `/Applications/StarUML.app/Contents/Resources/app.asar`。用
`open(路徑,"rb").read().decode("utf-8","replace")` 解出來之後，下列 idx 是字元位移。

| 事實 | idx |
|---|---|
| `UMLConstraint` 的 `specification`（prim String）與 `constrainedElements`（refs UMLModelElement） | 58811993 |
| `UMLMessage` 的 `signature`（ref UMLModelElement）與六個 prim 欄位 | 58839825 |
| `RelationshipEnd.reference`：`ref` 到 `Model`，`readOnly: true` | 53509138 |
| `Model.ownedElements`；`UMLModelElement` 沒有 `constraints` | 53506697 |
| `constraints` 屬性全 metamodel 只有 `SysMLBlock` 有，裝 `SysMLProperty` | 60934751 |
| `SysMLBlock` 的 `ports` 裝 `SysMLPort`；`UMLPort` 繼承自 `UMLAttribute` | 60934751 / 58821154 |
| `SysMLOperation` 全檔只出現一次，在 `app.factory.registerModelFn("SysMLOperation", _modelFn)` 那一行，不是 metamodel 的類別 | 60969053 |
| `NodeView` 的 left/top/width/height；`ParasiticView` 的 alpha/distance | 53511344 / 53513434 |
| `Engine.setProperty` 不檢查 readOnly | 23365702 |
| `Engine.reconnectEdge` 對 UndirectedRelationship 寫 `end1/end2.reference` | 23387711 |
| `Engine.moveParasiticView`：設 alpha/distance → `editor.repaint()` → diff → 一個可還原操作 | 23382734 |
| `Engine.addItem` / `removeItem` 走 `fieldInsert`／`fieldRemove`，會維護參照索引 | 23374194 / 23374868 |
| `Engine.layoutDiagram`：依索引拍快照 → repaint → 依索引比對差異 | 23404176 |
| `OperationBuilder.fieldAssign`；`_applyOperation` 只對單一元素更新索引 | 23823722 / 23834125 |
| `Repository.doOperation` 推 undo 堆疊；`Repository.undo()` 空堆疊靜默不動作；沒有 `canUndo()` | 23857529 / 23858486 |
| `Factory.createModel`：無 field 時預設 `ownedElements`；`defaultModelFn` 用 `engine.addModel` 後 `repository.get` | 23410111 / 23417118 |
| `EdgeParasiticView.arrangeObject`：從 alpha/distance 算 left/top | 23699052 |
| `Coord.getPointAwayLine`（正算）與 `Coord.getPolar`（反算） | 23742559 / 23743097 |
| `ParasiticManipulator.endManipulate`：拖曳用 `getPolar` 反算後寫 alpha/distance | 2198610 |
| `UMLSequenceDiagram.drawDiagram()` 呼叫 `regulateSequenceNumber()`；`layout()` 是空 stub | 58683091 |
| `regulateSequenceNumber()` 直接 splice `dgm.ownedViews` 與 `interaction.messages` | 58703662 |
| `DialogManager.showErrorDialog` = `ipcRenderer.sendSync("show-error-box", …)` | 23532934 |
| `app.diagrams.getHiddenEditor()`；StarUML 自己的版面外掛怎麼用它 | 2226179 / 62194750 |

### 第一手：這個 repo 的程式碼

`api-handler.js`、`handlers/crud-factory.js`、`handlers/shared-helpers.js`、
`test/mock-staruml.js`、`test/test_offline_units.js`、`test/verify_gaps_live.py`、
`test/run_integration_safely.sh`、`README.md`。

### 第一手：MCP servers repo

C-5 那一節的依據是這兩個檔，路徑寫全，複製貼上就能打開：

- `/Users/wuufone/Desktop/drawer/MyProjects/staruml-mcp-servers/staruml-controller-mcp-core/src/tools/elements.ts`
  —— 手抄的 `ALLOWED_CHILD_TYPES`，裡面還有 `SysMLOperation`。
- `/Users/wuufone/Desktop/drawer/MyProjects/staruml-mcp-servers/staruml-controller-mcp-core/src/tools/families/seq.ts`
  —— 訊息工具的 `updateFields`，裡面沒有 signature。

兩個檔我都確認存在（2026-09-05）。

### 引用的規範

UML 2.5.1 §17.12.18.7 的 `signature_refer_to` 與 `signature_is_operation_request`
——**引自你們的來信，我沒有另外查證規範原文**。B-1 的實作依照你們轉述的內容。

### 待確認

- 這一輪所有改動的實機行為（見第四節第三點）。
- `diagram_create_view_of` 回 `data: null` 的原因（未探測）。
