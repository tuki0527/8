import type { CanonicalChapter } from '../../domain/types.ts';

export const CHAPTERS_1_TO_5: CanonicalChapter[] = [
  {
    chapterId: 'ch1',
    order: 1,
    titleZh: '類別與物件',
    titleEn: 'Class & Object',
    scenarioTitle: '餐廳訂位系統 (Reservation)',
    summary: '從資料與函式分離走向「狀態＋行為」的物件模型，理解類別藍圖、建構子與實例獨立性。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch1.class_vs_instance',
        chapterId: 'ch1',
        titleZh: '類別藍圖與物件實例',
        titleEn: 'Class vs. Instance',
        importanceWeight: 1,
        summary: '類別定義結構與能力，透過 new 建立出的每個物件實例擁有各自獨立的記憶體狀態。',
      },
      {
        conceptId: 'ch1.state_and_behavior',
        chapterId: 'ch1',
        titleZh: '狀態與行為的結合',
        titleEn: 'State & Behavior',
        importanceWeight: 1,
        summary: '欄位與屬性代表物件當下的狀態，方法則是該物件對自身狀態執行的合法操作。',
      },
      {
        conceptId: 'ch1.constructor_init',
        chapterId: 'ch1',
        titleZh: '建構子與初始合法狀態',
        titleEn: 'Constructor Initialization',
        importanceWeight: 1,
        summary: '建構子在物件誕生瞬間要求必要資訊，避免建立出缺少關鍵欄位的半成品物件。',
      },
    ],
    slides: [
      {
        slideId: 'ch1-s1',
        chapterId: 'ch1',
        order: 1,
        title: '為什麼需要類別 (Class)？',
        contentVersion: 1,
        conceptIds: ['ch1.class_vs_instance'],
        corePoint: '將彼此相關的資料與操作打包成單一概念單位，讓程式碼對應真實問題領域。',
        locked: {
          definition: '類別 (Class) 是描述一組狀態 (State) 與行為 (Behavior) 的型別藍圖；物件 (Object) 是依此藍圖在執行期建立的實例 (Instance)。',
          termMappings: [
            { termZh: '類別', termEn: 'Class', meaning: '定義欄位、屬性與方法的靜態設計藍圖' },
            { termZh: '實例 / 物件', termEn: 'Instance / Object', meaning: '透過 new 在堆積 (Heap) 建立、具備獨立狀態的實體' },
          ],
          codeTitle: 'ReservationBasic.cs',
          codeLanguage: 'csharp',
          code: `public class Reservation
{
    public string GuestName { get; }
    public int PartySize { get; private set; }
    public bool IsConfirmed { get; private set; }

    public Reservation(string guestName, int partySize)
    {
        GuestName = guestName;
        PartySize = partySize;
        IsConfirmed = false;
    }

    public void Confirm() => IsConfirmed = true;
}`,
          expectedBehavior: [
            '建立兩個 Reservation 實例時，各自保留獨立的 GuestName 與 IsConfirmed。',
            '呼叫第一筆訂位的 Confirm() 不會影響第二筆訂位。',
          ],
          learningObjectives: [
            '能說出類別與實例的差異',
            '能分辨資料零散傳遞與物件導向建模的差別',
          ],
          rubricBasis: ['正確區分類別為型別定義、實例為執行期獨立狀態載體'],
        },
        editable: {
          analogy: {
            story: '餐廳的「訂位登記表格式」是類別，而「星期五晚上 7 點陳小姐 4 位」這張寫好內容的單子才是物件實例。',
            mapping: '格式本身不能打勾確認入座；只有拿到具體那張訂位單（實例），才能對它執行 Confirm()。',
            boundary: '紙本登記表不會自己檢查人數是否超過桌位上限，但 C# 類別方法可以內建規則檢查。',
          },
          plainExplanation: '以前學變數和函式時，常要傳 guestName、partySize、isConfirmed 三四個變數給不同函式；用類別包起來後，只要傳遞一個 Reservation 物件即可。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '建立兩個獨立訂位實例',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '依序推演 new Reservation()',
          steps: [
            {
              stepLabel: '1. 建立 r1',
              actor: 'Reservation r1 = new("林同學", 2);',
              stateSnapshot: { 'r1.GuestName': '"林同學"', 'r1.PartySize': '2', 'r1.IsConfirmed': 'false' },
              explanation: '配置第一塊實例空間並執行建構子，初始未確認。',
              highlightLine: 7,
            },
            {
              stepLabel: '2. 建立 r2',
              actor: 'Reservation r2 = new("王工程師", 5);',
              stateSnapshot: { 'r1.IsConfirmed': 'false', 'r2.GuestName': '"王工程師"', 'r2.IsConfirmed': 'false' },
              explanation: '配置第二塊實例空間，r1 與 r2 狀態完全隔離。',
              highlightLine: 7,
            },
            {
              stepLabel: '3. 確認 r1',
              actor: 'r1.Confirm();',
              stateSnapshot: { 'r1.IsConfirmed': 'true', 'r2.IsConfirmed': 'false' },
              explanation: '只修改 r1 的 IsConfirmed，r2 維持 false。',
              highlightLine: 14,
            },
          ],
        },
      },
      {
        slideId: 'ch1-s2',
        chapterId: 'ch1',
        order: 2,
        title: '欄位 (Field) 與屬性 (Property)',
        contentVersion: 1,
        conceptIds: ['ch1.state_and_behavior'],
        corePoint: 'C# 習慣以 private 欄位儲存底層資料，並透過 Property 控制對外讀寫語意。',
        locked: {
          definition: '欄位 (Field) 是類別內部的儲存變數；屬性 (Property) 提供 get/set 存取子，可在讀寫時維持語法簡潔並保留驗證擴充點。',
          termMappings: [
            { termZh: '欄位', termEn: 'Field', meaning: '類別內部的狀態變數，通常為 private' },
            { termZh: '屬性', termEn: 'Property', meaning: '對外公開讀寫介面的成員，可搭配 private set 或 init' },
          ],
          codeTitle: 'TableSlot.cs',
          codeLanguage: 'csharp',
          code: `public class TableSlot
{
    private int _seats; // 內部儲存欄位

    public string TableCode { get; }
    public int Seats
    {
        get => _seats;
        private set
        {
            if (value <= 0) throw new ArgumentOutOfRangeException(nameof(value));
            _seats = value;
        }
    }

    public TableSlot(string tableCode, int seats)
    {
        TableCode = tableCode;
        Seats = seats;
    }
}`,
          expectedBehavior: [
            'TableCode 只能在建構子指定一次，之後僅能讀取。',
            'Seats 透過 private set 阻擋負數或 0 的無效座位數。',
          ],
          learningObjectives: ['區分 Field 與 Property 的用途', '了解唯讀屬性與 private set 的意義'],
          rubricBasis: ['能說明為何不把所有資料都設成 public field'],
        },
        editable: {
          analogy: {
            story: '欄位像餐廳廚房裡的食材庫存本，屬性則是櫃台對外回答「現在還有幾份」的窗口。',
            mapping: '客人可以透過櫃台詢問剩餘座位（get），但不能直接伸手改庫存數字（private set）。',
            boundary: '自動實作屬性（{ get; private set; }）在無額外邏輯時由編譯器自動產生隱藏欄位，不用手寫支援欄位。',
          },
          plainExplanation: '把屬性寫成 `{ get; private set; }` 讓外部能方便讀取 `slot.Seats`，同時確保只有類別自己的方法能合法更改座位數。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch1-s3',
        chapterId: 'ch1',
        order: 3,
        title: '方法 (Method) 代表物件的責任行為',
        contentVersion: 1,
        conceptIds: ['ch1.state_and_behavior'],
        corePoint: '方法不是隨便放的靜態工具函式，而是依附於物件自身狀態的動作。',
        locked: {
          definition: '方法 (Method) 定義物件能執行的行為，並直接運用或更新該實例的狀態（隱含 this 參考）。',
          termMappings: [
            { termZh: '實例方法', termEn: 'Instance Method', meaning: '需要透過物件實例呼叫、可存取該實例狀態的方法' },
            { termZh: '靜態成員', termEn: 'Static Member', meaning: '屬於類別本身而非個別實例的成員' },
          ],
          codeTitle: 'ReservationMethods.cs',
          codeLanguage: 'csharp',
          code: `public class Reservation
{
    public int PartySize { get; private set; }
    public bool IsCancelled { get; private set; }

    public Reservation(int partySize) => PartySize = partySize;

    public void UpdatePartySize(int newSize)
    {
        if (IsCancelled)
            throw new InvalidOperationException("已取消的訂位不可更改人數。");
        if (newSize is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(newSize));
        PartySize = newSize;
    }

    public void Cancel() => IsCancelled = true;
}`,
          expectedBehavior: [
            '呼叫 Cancel() 後再呼叫 UpdatePartySize(4) 會拋出 InvalidOperationException。',
            '狀態變更與業務規則檢查集中於物件自身方法內。',
          ],
          learningObjectives: ['讓方法保護自身狀態轉換', '區分實例方法與 static 工具函式'],
          rubricBasis: ['行為應由擁有相關狀態的物件執行，避免外部直接竄改狀態'],
        },
        editable: {
          analogy: {
            story: '微波爐把「設定秒數」和「開始加熱」做成面板按鈕，而不是叫使用者自己拆開外殼調磁控管。',
            mapping: 'Cancel() 與 UpdatePartySize() 就是訂位物件對外提供的安全操作按鈕。',
            boundary: '方法不等於無限膨脹；如果方法需要外部寄信或寫資料庫，通常會交給服務類別處理。',
          },
          plainExplanation: '與其寫 `if (!r.IsCancelled && size >= 1) r.PartySize = size;` 散落在專案各處，不如做成 `r.UpdatePartySize(size)`，規則只寫一次。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch1-s4',
        chapterId: 'ch1',
        order: 4,
        title: '建構子 (Constructor) 與物件誕生條件',
        contentVersion: 1,
        conceptIds: ['ch1.constructor_init'],
        corePoint: '物件一建立就該處於合法可用的初始狀態，建構子負責守住這條起跑線。',
        locked: {
          definition: '建構子 (Constructor) 是在 new 建立實例時自動執行的特殊方法，負責接收必要依賴或初始參數並完成驗證。',
          termMappings: [
            { termZh: '建構子', termEn: 'Constructor', meaning: '與類別同名、無回傳型別的初始化成員' },
            { termZh: '無效狀態', termEn: 'Invalid State', meaning: '缺少必要欄位或違反商業規則的半成品物件狀態' },
          ],
          codeTitle: 'ReservationConstructor.cs',
          codeLanguage: 'csharp',
          code: `public class Reservation
{
    public string GuestName { get; }
    public DateTimeOffset ReservedAt { get; }

    public Reservation(string guestName, DateTimeOffset reservedAt)
    {
        if (string.IsNullOrWhiteSpace(guestName))
            throw new ArgumentException("訂位人姓名不可為空白。", nameof(guestName));

        GuestName = guestName.Trim();
        ReservedAt = reservedAt;
    }
}`,
          expectedBehavior: [
            '傳入空白姓名會在 new 階段立即失敗，不會產出姓名為空的 Reservation 物件。',
            '成功建立後，GuestName 已經過 Trim() 標準化。',
          ],
          learningObjectives: ['設計有意義的建構子參數', '避免使用無參數建構子製造大量 null 欄位'],
          rubricBasis: ['建構子應驗證必要前置條件並初始化必要狀態'],
        },
        editable: {
          analogy: {
            story: '開立登機證時系統一定要求先填乘客姓名與班次，不可能先印一張全空白的票等登機門前再手寫。',
            mapping: '建構子參數就是登機證的必填欄位，缺一不可。',
            boundary: '若某屬性確實屬於可選補充資訊（例如備註），才適合作為選填參數或獨立方法設定。',
          },
          plainExplanation: '如果類別只用無參數建構子，外部就很容易忘記設定某個屬性；把必填值放進建構子，編譯器就會提醒呼叫端一定要給。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch1-s5',
        chapterId: 'ch1',
        order: 5,
        title: '參考型別 (Reference Type) 與變數指涉',
        contentVersion: 1,
        conceptIds: ['ch1.class_vs_instance'],
        corePoint: '在 C# 中 class 是參考型別：複製變數只是複製指向同一物件的參考，而不是複製整個物件。',
        locked: {
          definition: 'C# 的 class 屬於參考型別 (Reference Type)；將變數 a 指定給 b 時，兩者指向記憶體中同一個物件實例。',
          termMappings: [
            { termZh: '參考型別', termEn: 'Reference Type', meaning: '變數儲存指向物件實例的參考位址' },
            { termZh: '參考相等', termEn: 'Reference Equality', meaning: '兩個變數是否指向同一個物件實例 (ReferenceEquals)' },
          ],
          codeTitle: 'ReferenceSemantics.cs',
          codeLanguage: 'csharp',
          code: `var first = new Reservation("陳小姐", 2);
var alias = first; // 複製參考，仍指向同一實例

alias.Confirm();
// 此時 first.IsConfirmed 也是 true！

var another = new Reservation("陳小姐", 2);
// another 是全新的另一個實例，another.IsConfirmed 為 false`,
          expectedBehavior: [
            '透過 alias.Confirm() 修改狀態，first.IsConfirmed 同步變為 true。',
            'another 雖然內容相同，但因使用 new 建立，狀態與 first 互不相干。',
          ],
          learningObjectives: ['預期參考型別賦值後的狀態共享行為', '區分「兩個變數指向同一物件」與「兩個內容相同的物件」'],
          rubricBasis: ['正確解釋 class 賦值不建立深層複本'],
        },
        editable: {
          analogy: {
            story: '兩支手機同時打開同一份雲端共用訂位表單，其中一人按確認，另一支手機看到的畫面也變成已確認。',
            mapping: 'first 與 alias 就像綁定同一份表單連結的兩個捷徑。',
            boundary: '若需要純資料不可變且以值比對相等性，C# 可考慮 record 或 readonly struct，這是後續設計取捨。',
          },
          plainExplanation: '初學 OOP 最常踩的坑就是以為 `var b = a;` 會自動複製一份新物件。記住：只有 `new`（或明確的複製方法）才會誕生新實例。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch1-s6',
        chapterId: 'ch1',
        order: 6,
        title: '類別設計檢核：別把類別寫成純資料袋',
        contentVersion: 1,
        conceptIds: ['ch1.state_and_behavior', 'ch1.constructor_init'],
        corePoint: '避免貧血物件（只有一堆 public get; set; 卻沒有保護規則與行為）。',
        locked: {
          definition: '良好類別應將與狀態密切相關的驗證與轉換行為留在類別內部，避免讓外部程式碼直接讀寫所有欄位再自行判斷。',
          termMappings: [
            { termZh: '資料傳遞物件', termEn: 'DTO (Data Transfer Object)', meaning: '僅用於跨邊界傳送資料的單純結構' },
            { termZh: '領域物件', termEn: 'Domain Object', meaning: '封裝業務規則與狀態行為的核心物件' },
          ],
          codeTitle: 'CompareDesign.cs',
          codeLanguage: 'csharp',
          code: `// 較弱設計：外部可任意改成負數或跳過狀態檢查
public class WeakOrder { public int Quantity { get; set; } }

// 較佳設計：物件負責維持數量合法性
public class OrderLine
{
    public string ProductName { get; }
    public int Quantity { get; private set; }

    public OrderLine(string productName, int quantity)
    {
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
        ProductName = productName;
        Quantity = quantity;
    }

    public void AddQuantity(int delta)
    {
        if (Quantity + delta <= 0) throw new InvalidOperationException("數量必須大於 0");
        Quantity += delta;
    }
}`,
          expectedBehavior: [
            'WeakOrder 無法阻止 order.Quantity = -5。',
            'OrderLine 確保任何時間點 Quantity 皆大於 0。',
          ],
          learningObjectives: ['區分純資料傳輸 DTO 與具行為的領域類別', '檢視自己的類別是否缺少行為'],
          rubricBasis: ['能說明把規則放進類別方法如何減少重複檢查與非法狀態'],
        },
        editable: {
          analogy: {
            story: '沒有門鎖跟櫃員機制的銀行金庫只是個開放倉庫，誰都能自己走進去改帳本。',
            mapping: 'OrderLine.AddQuantity 就是有規則檢查的交易窗口。',
            boundary: '用來序列化 API JSON 的 Request/Response 模型本身就可以是單純的 DTO，不強迫每個型別都放業務邏輯。',
          },
          plainExplanation: '不是所有 class 都要很複雜；重點是「會被規則約束的業務狀態」不要裸奔在外面。',
          detailLevel: 'standard',
          layoutVariant: 'comparison_columns',
        },
      },
    ],
  },
  {
    chapterId: 'ch2',
    order: 2,
    titleZh: '封裝',
    titleEn: 'Encapsulation',
    scenarioTitle: '數位錢包與購物車 (Wallet & Cart)',
    summary: '封裝不只是加上 private；核心在於隱藏內部實作細節並強制維持不變量 (Invariant)。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch2.invariant_protection',
        chapterId: 'ch2',
        titleZh: '維持物件不變量',
        titleEn: 'Invariant Protection',
        importanceWeight: 1.2,
        summary: '不變量是物件在任何操作前後都必須為真的條件（例如餘額不可為負、購物車總額與明細一致）。',
      },
      {
        conceptId: 'ch2.encapsulation_vs_private',
        chapterId: 'ch2',
        titleZh: '封裝不等於全欄位設 private + Get/Set',
        titleEn: 'Beyond Private Getters/Setters',
        importanceWeight: 1,
        summary: '對每個 private 欄位機械式開出 public setter 等於破壞封裝；應提供具領域語意的操作。',
      },
      {
        conceptId: 'ch2.collection_encapsulation',
        chapterId: 'ch2',
        titleZh: '集合與內部狀態的防禦性保護',
        titleEn: 'Defensive Collection Exposure',
        importanceWeight: 1,
        summary: '對外暴露 List<T> 會讓呼叫端繞過規則直接 Add/Clear，應改回傳 IReadOnlyList<T>。',
      },
    ],
    slides: [
      {
        slideId: 'ch2-s1',
        chapterId: 'ch2',
        order: 1,
        title: '封裝的真正目的：不變量 (Invariant)',
        contentVersion: 1,
        conceptIds: ['ch2.invariant_protection'],
        corePoint: '封裝透過限制修改途徑，保證物件內部規則永遠不被外部破壞。',
        locked: {
          definition: '封裝 (Encapsulation) 是將狀態的儲存表示與不變量 (Invariant) 規則保護在類別邊界內，只公開經過驗證的合法操作介面。',
          termMappings: [
            { termZh: '封裝', termEn: 'Encapsulation', meaning: '隱藏實作細節並保護物件不變量的機制' },
            { termZh: '不變量', termEn: 'Invariant', meaning: '物件在整個生命週期中必須始終成立的規則條件' },
          ],
          codeTitle: 'Wallet.cs',
          codeLanguage: 'csharp',
          code: `public class Wallet
{
    public decimal Balance { get; private set; }

    public Wallet(decimal initialBalance)
    {
        if (initialBalance < 0)
            throw new ArgumentOutOfRangeException(nameof(initialBalance));
        Balance = initialBalance;
    }

    public void Deposit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));
        Balance += amount;
    }

    public bool TryWithdraw(decimal amount)
    {
        if (amount <= 0 || amount > Balance) return false;
        Balance -= amount;
        return true;
    }
}`,
          expectedBehavior: [
            'Balance 永遠不會變為負數。',
            '外部無法寫 wallet.Balance = -500 或跳過額度檢查直接扣款。',
          ],
          learningObjectives: ['說出什麼是物件的不變量', '實作保護餘額的儲值與扣款方法'],
          rubricBasis: ['封裝的核心是保護不變量與合法狀態轉換，而非單純隱藏變數名稱'],
        },
        editable: {
          analogy: {
            story: '自動販賣機不允許你打開玻璃門直接拿飲料或改螢幕上的餘額，只能投幣、按按鈕、找零。',
            mapping: '投幣 (Deposit) 與購買 (TryWithdraw) 是合法操作；餘額 >= 0 就是販賣機死守的不變量。',
            boundary: '這個比喻強調存取邊界；在程式中除了防惡意，更重要的是防止團隊協作時無意間寫錯狀態。',
          },
          plainExplanation: '如果有人問「為什麼不直接讓 Balance 可以 set？」，答案不是「老師規定要 private」，而是「若能直接 set，系統裡到處都可能出現 -300 元的幽靈餘額」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '錢包扣款與不變量防線推演',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '依序模擬存款與超額扣款',
          steps: [
            {
              stepLabel: '1. 初始化',
              actor: 'var w = new Wallet(500m);',
              stateSnapshot: { Balance: '500', 不變量狀態: '成立 (>= 0)' },
              explanation: '建構子驗證 500 >= 0 通過，建立錢包。',
              highlightLine: 5,
            },
            {
              stepLabel: '2. 儲值 200',
              actor: 'w.Deposit(200m);',
              stateSnapshot: { Balance: '700', 不變量狀態: '成立 (>= 0)' },
              explanation: '金額大於 0，餘額更新為 700。',
              highlightLine: 12,
            },
            {
              stepLabel: '3. 嘗試扣款 900',
              actor: 'bool ok = w.TryWithdraw(900m);',
              stateSnapshot: { 回傳值: 'false', Balance: '700 (未變動)', 不變量狀態: '受保護維持成立' },
              explanation: '因 900 > 700，拒絕扣款並回傳 false，餘額不變。',
              highlightLine: 20,
            },
          ],
        },
      },
      {
        slideId: 'ch2-s2',
        chapterId: 'ch2',
        order: 2,
        title: '迷思破解：private 欄位 + public Set 並非封裝',
        contentVersion: 1,
        conceptIds: ['ch2.encapsulation_vs_private'],
        corePoint: '把欄位改成 private 再加上毫無條件的 Get/Set 方法，只是換個語法裸露內部狀態。',
        locked: {
          definition: '真正的封裝應暴露「意圖明確的領域操作」，而非對每個內部欄位機械式提供無條件讀寫的 getter/setter。',
          termMappings: [
            { termZh: '存取修飾詞', termEn: 'Access Modifier', meaning: 'public / private / internal / protected 等可見度控制關鍵字' },
            { termZh: '偽封裝', termEn: 'Broken Encapsulation', meaning: '將欄位設 private 卻開出無限制 setter 導致規則仍散落外部' },
          ],
          codeTitle: 'PseudoVsTrueEncapsulation.cs',
          codeLanguage: 'csharp',
          code: `// 偽封裝：外部照樣能破壞一致性
public class BadCart
{
    private decimal _total;
    public decimal GetTotal() => _total;
    public void SetTotal(decimal value) => _total = value; // 誰都能亂改總額！
}

// 真封裝：總額由品項計算或受內部操作維護，不允許直接竄改
public class GoodCart
{
    private readonly List<CartItem> _items = new();
    public decimal TotalAmount => _items.Sum(i => i.Subtotal);
    public void AddItem(string sku, decimal unitPrice, int qty)
        => _items.Add(new CartItem(sku, unitPrice, qty));
}`,
          expectedBehavior: [
            'BadCart 允許商品總價只有 100 元卻被 SetTotal(0)。',
            'GoodCart 的 TotalAmount 永遠與內部 _items 一致。',
          ],
          learningObjectives: ['辨識無意義的 getter/setter 樣板', '改以領域操作取代直接設值'],
          rubricBasis: ['明確指出「全部 private 欄位」本身不等於完成封裝'],
        },
        editable: {
          analogy: {
            story: '把金庫門鎖起來，卻在門口貼一張「請自行拿旁邊的萬能鑰匙修改帳本數字」，鎖了等於沒鎖。',
            mapping: 'SetTotal(value) 就是那把讓任何人都能改寫總金額的萬能鑰匙。',
            boundary: '某些單純設定值確實可讀取或更新（如顯示名稱），重點在於有規則關聯的欄位不能獨立任人修改。',
          },
          plainExplanation: '寫 C# 時不要反射性把每個欄位都配一個 public set；先問自己：「外部真的應該直接設定這個數字，還是應該透過一個動作來改變它？」',
          detailLevel: 'standard',
          layoutVariant: 'comparison_columns',
        },
      },
      {
        slideId: 'ch2-s3',
        chapterId: 'ch2',
        order: 3,
        title: '保護內部集合：別直接回傳 List<T>',
        contentVersion: 1,
        conceptIds: ['ch2.collection_encapsulation'],
        corePoint: '即使屬性本身是只讀 get，若回傳可變集合 List<T>，呼叫端依然能偷偷 Clear() 或 Add()。',
        locked: {
          definition: '對外公開內部可變集合參考會破壞封裝；應回傳 IReadOnlyList<T> 或唯讀包裝 (.AsReadOnly())，強制所有異動經過類別方法。',
          termMappings: [
            { termZh: '唯讀介面', termEn: 'IReadOnlyList<T>', meaning: '僅提供索引與列舉讀取、不提供 Add/Remove 的集合契約' },
            { termZh: '代表漏水', termEn: 'Representation Exposure', meaning: '把內部可變物件參考洩漏給外部導致狀態失控' },
          ],
          codeTitle: 'ShoppingCartItems.cs',
          codeLanguage: 'csharp',
          code: `public class ShoppingCart
{
    private readonly List<CartItem> _items = new();

    // 即使只寫 get，若型別是 List<CartItem>，外部仍能 cart.Items.Clear()！
    // 正確做法：暴露 IReadOnlyList<CartItem>
    public IReadOnlyList<CartItem> Items => _items.AsReadOnly();

    public void AddItem(string sku, decimal price, int qty)
    {
        if (_items.Count >= 50)
            throw new InvalidOperationException("單筆購物車最多 50 項商品。");
        _items.Add(new CartItem(sku, price, qty));
    }
}`,
          expectedBehavior: [
            '外部程式碼無法呼叫 cart.Items.Add(...) 或 cart.Items.Clear()（編譯即擋下）。',
            'AsReadOnly() 也防止呼叫端強制轉型回 List<CartItem> 來偷改。',
          ],
          learningObjectives: ['理解 get-only 屬性搭配可變 List 的漏洞', '使用 AsReadOnly() 與 IReadOnlyList<T>'],
          rubricBasis: ['能指出只寫 get 不寫 set 仍可能被外部呼叫 .Add()/.Clear() 破壞'],
        },
        editable: {
          analogy: {
            story: '百貨公司展示櫃讓你隔著玻璃看所有商品（IReadOnlyList），想加購必須透過店員結帳檯（AddItem）。',
            mapping: '若直接回傳 List<T>，就像把展示櫃門打開讓客人自己塞東西進去而不經收銀機。',
            boundary: '若連集合內的元素本身也是可變物件，元素自身也需要妥善封裝或採用不可變 record。',
          },
          plainExplanation: '這在 C# 實務非常常見：`public List<Item> Items { get; }` 看起來唯讀，其實只是不能把整個清單換掉，內容還是能被隨便清空。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch2-s4',
        chapterId: 'ch2',
        order: 4,
        title: '隱藏實作細節：更換內部資料結構不影響呼叫端',
        contentVersion: 1,
        conceptIds: ['ch2.invariant_protection', 'ch2.encapsulation_vs_private'],
        corePoint: '封裝讓類別能自由替換內部儲存方式，而所有外部呼叫端一行都不用改。',
        locked: {
          definition: '當外部只依賴類別公開的方法與抽象屬性時，內部從單純數值改為事件帳本或不同集合結構皆可安全重構。',
          termMappings: [
            { termZh: '實作隱藏', termEn: 'Information Hiding', meaning: '隱藏資料如何被儲存與計算的內部決定' },
          ],
          codeTitle: 'WalletLedgerRefactor.cs',
          codeLanguage: 'csharp',
          code: `// 演進版 Wallet：對外介面完全沒變，內部改用交易明細計算餘額
public class Wallet
{
    private readonly List<decimal> _entries = new();
    public decimal Balance => _entries.Sum();

    public Wallet(decimal initial) => _entries.Add(initial);
    public void Deposit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));
        _entries.Add(amount);
    }
    public bool TryWithdraw(decimal amount)
    {
        if (amount <= 0 || amount > Balance) return false;
        _entries.Add(-amount);
        return true;
    }
}`,
          expectedBehavior: [
            '既有呼叫 wallet.Balance、wallet.Deposit(100)、wallet.TryWithdraw(50) 的程式碼完全無需修改。',
            '內部卻自然獲得完整交易加減紀錄能力。',
          ],
          learningObjectives: ['體會資訊隱藏帶來的重構安全感'],
          rubricBasis: ['能說明為何穩定對外介面可隔離內部資料結構變更'],
        },
        editable: {
          analogy: {
            story: '電力公司把傳統機械電表換成智慧電表，家裡的插頭介面一樣是 110V 雙孔，所有家電照常運作。',
            mapping: '外部呼叫 Balance 的方法就是家電插頭，內部改用 _entries 計算則是電表升級。',
            boundary: '若公開簽章（方法名稱或參數型別）必須更改，仍會影響呼叫端，因此初期介面語意要設計清楚。',
          },
          plainExplanation: '這就是為什麼高手重視「對外只曝露必要能力」：以後想加 log、快取或換資料結構，只改這一個檔案就好。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch2-s5',
        chapterId: 'ch2',
        order: 5,
        title: '存取修飾詞選擇：public、private、internal 與 protected',
        contentVersion: 1,
        conceptIds: ['ch2.encapsulation_vs_private'],
        corePoint: '依「誰需要知道這件事」選擇最小必要可見度，減少不必要的跨模組依賴。',
        locked: {
          definition: 'C# 存取修飾詞界定成員的可見邊界：private（僅本類別）、protected（本類別與子類別）、internal（同組件 Assembly）、public（全部）。',
          termMappings: [
            { termZh: '組件內部', termEn: 'internal', meaning: '僅同一個 C# 專案／編譯組件 (Assembly) 內可存取' },
            { termZh: '最小權限原則', termEn: 'Least Privilege', meaning: '成員預設維持最低可見度，確認需要時才開放' },
          ],
          codeTitle: 'AccessModifiers.cs',
          codeLanguage: 'csharp',
          code: `public class CouponPolicy
{
    private readonly decimal _maxDiscountRate = 0.30m;

    // 同專案測試或輔助工廠可用，不暴露給外部使用者
    internal CouponPolicy(decimal maxRate) => _maxDiscountRate = maxRate;
    public CouponPolicy() { }

    public decimal CalculateDiscount(decimal subtotal, decimal requestedRate)
    {
        var appliedRate = ClampRate(requestedRate);
        return subtotal * appliedRate;
    }

    private decimal ClampRate(decimal rate)
        => Math.Clamp(rate, 0m, _maxDiscountRate);
}`,
          expectedBehavior: [
            'ClampRate 屬於內部運算細節，外部呼叫端看不到也不需要知道。',
            'CalculateDiscount 提供明確的商業計算入口。',
          ],
          learningObjectives: ['正確使用 private、internal、public', '避免將輔助方法全部設成 public'],
          rubricBasis: ['正確區分 C# 四種常見存取修飾詞的範圍'],
        },
        editable: {
          analogy: {
            story: '餐廳菜單給客人看 (public)、內部調度規則貼在廚房牆上 (internal)、主廚私房秘方留在筆記本 (private)。',
            mapping: '把廚房內部流程貼到門口菜單只會讓客人困惑，還會讓餐廳以後換動線變得困難。',
            boundary: '若專案只有單一組件且搭配單元測試，常透過 InternalsVisibleTo 讓測試專案讀取 internal 工廠。',
          },
          plainExplanation: '寫類別時先預設成員為 private，真正需要成為對外契約的才加上 public。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch2-s6',
        chapterId: 'ch2',
        order: 6,
        title: 'Tell, Don’t Ask：把判斷邏輯交給擁有資料的物件',
        contentVersion: 1,
        conceptIds: ['ch2.invariant_protection', 'ch2.encapsulation_vs_private'],
        corePoint: '不要把物件的狀態全拿出來自己 if/else 再寫回去，而是直接命令物件執行該業務動作。',
        locked: {
          definition: '「Tell, Don’t Ask」原則主張將依據物件內部狀態做決策的邏輯內聚於該物件的方法中，減少外部重複判斷。',
          termMappings: [
            { termZh: '只下指令不盤問', termEn: 'Tell, Don’t Ask', meaning: '直接呼叫物件行為方法，而非拉出狀態欄位在外部做判斷' },
          ],
          codeTitle: 'TellDontAsk.cs',
          codeLanguage: 'csharp',
          code: `// Ask 風格：外部一直問出狀態、自己算完再改回去
if (member.Points >= 100 && !member.IsSuspended)
{
    member.Deduction(100);
}

// Tell 風格：直接請 Member 依自身規則嘗試兌換
public bool TryRedeemReward(int costPoints)
{
    if (IsSuspended || Points < costPoints || costPoints <= 0)
        return false;
    Points -= costPoints;
    return true;
}`,
          expectedBehavior: [
            '即使日後新增「VIP 會員點數折半」或「過期檢查」，只需改 TryRedeemReward 內部。',
          ],
          learningObjectives: ['重構 Ask 風格條件式為 Tell 風格方法'],
          rubricBasis: ['能解釋將條件判斷移入物件方法的好處'],
        },
        editable: {
          analogy: {
            story: '搭捷運時你直接刷悠遊卡（Tell），讓閘門自己驗餘額跟黑名單；不是站在閘門前把餘額念出來自己算完再報給站務員。',
            mapping: 'TryRedeemReward 就是把驗卡與扣款合成一個原子操作。',
            boundary: '只單純要在畫面上顯示「剩餘點數：120」時，讀取屬性當然是合理的 Ask，不用過度教條化。',
          },
          plainExplanation: '看到程式碼某處寫著 `if (obj.A && obj.B > 0) obj.DoSomething();` 而且到處重複時，就是把它收進 `obj` 內部的訊號。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
    ],
  },
  {
    chapterId: 'ch3',
    order: 3,
    titleZh: '責任分配、內聚與耦合',
    titleEn: 'Responsibility, Cohesion & Coupling',
    scenarioTitle: '訂單結帳與庫存流程 (Order & Inventory)',
    summary: '學會判斷「這段程式該放哪個類別」，用修改影響範圍評估高內聚與低耦合。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch3.cohesion',
        chapterId: 'ch3',
        titleZh: '高內聚 (High Cohesion)',
        titleEn: 'High Cohesion',
        importanceWeight: 1.2,
        summary: '單一類別內的成員應緊密圍繞同一項明確責任協作，不該把風馬牛不相及的功能塞在一起。',
      },
      {
        conceptId: 'ch3.coupling',
        chapterId: 'ch3',
        titleZh: '低耦合 (Low Coupling)',
        titleEn: 'Low Coupling',
        importanceWeight: 1.2,
        summary: '耦合代表兩個模組之間的相依強度；降低不必要依賴能讓改動A時不會連帶弄壞B。',
      },
      {
        conceptId: 'ch3.srp_change_impact',
        chapterId: 'ch3',
        titleZh: '以變更原因判斷責任邊界',
        titleEn: 'Single Responsibility & Change Impact',
        importanceWeight: 1,
        summary: '當「稅率公式改了」與「通知格式改了」必須修改同一個類別，就表示責任混雜過高。',
      },
    ],
    slides: [
      {
        slideId: 'ch3-s1',
        chapterId: 'ch3',
        order: 1,
        title: '什麼是上帝類別 (God Class) 的警訊？',
        contentVersion: 1,
        conceptIds: ['ch3.cohesion', 'ch3.srp_change_impact'],
        corePoint: '把驗證、折扣、扣庫存、發 Email、寫 Log 全塞在一個類別裡，會讓任何小改動都充滿風險。',
        locked: {
          definition: '內聚 (Cohesion) 衡量一個類別內部各成員為同一責任協作的緊密程度；低內聚的類別往往同時承擔多種不相關的變更理由。',
          termMappings: [
            { termZh: '高內聚', termEn: 'High Cohesion', meaning: '類別內的方法與欄位都服務於同一個清楚的核心責任' },
            { termZh: '單一職責原則', termEn: 'Single Responsibility Principle (SRP)', meaning: '一個類別應該只有一個主要的變更理由' },
          ],
          codeTitle: 'MonolithicOrderManager.cs',
          codeLanguage: 'csharp',
          code: `// 反例：低內聚 — 集價格計算、庫存、寄信與寫檔於一身
public class OrderManager
{
    public void PlaceOrder(string userEmail, string sku, int qty)
    {
        if (qty <= 0) throw new ArgumentException("數量錯誤");
        decimal price = sku == "BOOK-1" ? 450m * qty : 300m * qty;
        if (qty >= 3) price *= 0.9m; // 折扣規則
        // 直接寫死 SQL 與 SMTP 寄信細節...
        File.AppendAllText("orders.log", $"{DateTime.UtcNow}: {sku} x {qty}\n");
    }
}`,
          expectedBehavior: [
            '修改折扣算法、更換通知管道或改變 log 格式，全部都要打開同一個 OrderManager 修改。',
            '難以在不寫檔的情況下單獨測試折扣計算。',
          ],
          learningObjectives: ['辨識低內聚的上帝類別', '列舉不同變更原因對檔案的影響'],
          rubricBasis: ['透過變更需求分析指出責任混雜導致的測試與維護成本'],
        },
        editable: {
          analogy: {
            story: '一家小店只有一位老闆兼會計、廚師、外送員跟水電工；每次換菜單、換外送箱或報稅，都只能等這同一個人全部停下來調整。',
            mapping: 'OrderManager 就是把算錢、記帳、發通知全扛在身上的老闆。',
            boundary: '非常小的一次性腳本放同一個類別反而簡單；只有當規則會各自獨立演變時才需要拆分責任。',
          },
          plainExplanation: '別只看程式碼行數決定拆不拆，要看「會不會因為不同的業務原因去改同一塊程式」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch3-s2',
        chapterId: 'ch3',
        order: 2,
        title: '拆分責任：讓每個類別專心做好一件事',
        contentVersion: 1,
        conceptIds: ['ch3.cohesion', 'ch3.srp_change_impact'],
        corePoint: '將「算金額」、「扣庫存」、「記錄／通知」拆成專職小類別，再由協調者串接。',
        locked: {
          definition: '依變更原因將領域計算 (PricingCalculator)、庫存規則 (InventoryService) 與流程協調 (CheckoutCoordinator) 分離，可提升各模組內聚性與可測性。',
          termMappings: [
            { termZh: '責任分配', termEn: 'Responsibility Assignment', meaning: '決定哪個類別負責保管某項規則或執行某項決策' },
          ],
          codeTitle: 'CohesiveCheckout.cs',
          codeLanguage: 'csharp',
          code: `public class PricingCalculator
{
    public decimal ComputeTotal(decimal unitPrice, int qty)
    {
        var subtotal = unitPrice * qty;
        return qty >= 3 ? subtotal * 0.9m : subtotal;
    }
}

public class CheckoutCoordinator
{
    private readonly PricingCalculator _pricing = new();
    public decimal PreviewTotal(decimal unitPrice, int qty)
        => _pricing.ComputeTotal(unitPrice, qty);
}`,
          expectedBehavior: [
            'PricingCalculator 不依賴檔案系統或網路，可直接進行純邏輯單元測試。',
            '更改滿三件九折條件時，只需修改 PricingCalculator。',
          ],
          learningObjectives: ['把純業務計算與外部 I/O 拆開', '實作高內聚的小型類別'],
          rubricBasis: ['能將混合流程拆出獨立的高內聚責任單元'],
        },
        editable: {
          analogy: {
            story: '點餐櫃台負責算帳單，廚房負責備餐，外送員負責送達；換了外送袋不需要叫會計重學加減法。',
            mapping: 'PricingCalculator 只管算錢，完全不關心怎麼印收據或寄 Email。',
            boundary: '過度微細拆分（一個兩行的方法也硬拆成五個類別）會造成閱讀跳躍，須維持適度粒度。',
          },
          plainExplanation: '拆分之後最明顯的好處是：測試算價錢完全不用連資料庫也不用真的寄信。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch3-s3',
        chapterId: 'ch3',
        order: 3,
        title: '耦合 (Coupling) 的面向：依賴了誰、知道多少？',
        contentVersion: 1,
        conceptIds: ['ch3.coupling'],
        corePoint: '耦合不可能為零，重點是「依賴穩定的契約，而不是依賴對方的內部細節」。',
        locked: {
          definition: '耦合 (Coupling) 是模組之間相依的程度。當類別 A 直接存取 B 的內部細節或具體實作類別時，屬於緊耦合 (Tight Coupling)。',
          termMappings: [
            { termZh: '緊耦合', termEn: 'Tight Coupling', meaning: '依賴具體實作或內部細節，一方變動容易牽連另一方編譯或執行失敗' },
            { termZh: '鬆耦合', termEn: 'Loose Coupling', meaning: '透過穩定、精簡的公開介面互動，降低彼此內部變更的連鎖反應' },
          ],
          codeTitle: 'CouplingComparison.cs',
          codeLanguage: 'csharp',
          code: `// 緊耦合：Checkout 直接綁死特定寄信實作與其設定細節
public class TightCheckout
{
    public void Complete(string email)
    {
        var smtp = new SmtpEmailClient("smtp.example.com", 587);
        smtp.ConnectAndSend(email, "訂單完成");
    }
}

// 降低知識耦合：只依賴單一 SendConfirmation 方法
public class SmtpEmailClient
{
    public SmtpEmailClient(string host, int port) { /* ... */ }
    public void ConnectAndSend(string to, string subject) { /* ... */ }
}`,
          expectedBehavior: [
            '只要 SmtpEmailClient 建構子多一個 API Key 參數，TightCheckout 就得跟著改寫。',
          ],
          learningObjectives: ['區分「合理使用」與「過度緊耦合」', '識別隱藏的結構知識依賴'],
          rubricBasis: ['能指出具體類別 new 與公開細節過多如何造成緊耦合'],
        },
        editable: {
          analogy: {
            story: '如果你想跟朋友約吃飯卻要親自設定他家的鬧鐘、檢查他車子胎壓再幫他發動，這就是緊耦合；只傳一則「晚上七點見」的訊息才是鬆耦合。',
            mapping: '在呼叫端硬寫 host 與 port 就是管了太多對方的內部初始化細節。',
            boundary: '鬆耦合不是「完全不呼叫別人」，系統總需要協作，關鍵在於只知道最少必要資訊。',
          },
          plainExplanation: '評斷耦合高低有一個很實用的問題：「如果我把對方換成另一種寫法，我這邊要改幾行？」',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch3-s4',
        chapterId: 'ch3',
        order: 4,
        title: '具體變更推演：當需求從「免運門檻 1000」變成「VIP 全免運」',
        contentVersion: 1,
        conceptIds: ['ch3.cohesion', 'ch3.coupling', 'ch3.srp_change_impact'],
        corePoint: '比較兩種設計好壞的最佳方式，是帶入一個具體的新需求，看哪邊要改、會不會誤傷無關功能。',
        locked: {
          definition: '透過「具體變更需求」追蹤受影響的檔案數與測試範圍，是評估耦合與內聚的客觀依據。',
          termMappings: [
            { termZh: '變更影響分析', termEn: 'Change Impact Analysis', meaning: '模擬需求異動時需要修改與回歸測試的模組範圍' },
          ],
          codeTitle: 'ShippingRuleChange.cs',
          codeLanguage: 'csharp',
          code: `public record OrderContext(decimal Subtotal, bool IsVip);

public class ShippingRule
{
    public decimal CalculateFee(OrderContext ctx)
    {
        if (ctx.IsVip) return 0m;              // 變更點集中在單一方法
        return ctx.Subtotal >= 1000m ? 0m : 80m;
    }
}`,
          expectedBehavior: [
            '新增 VIP 免運條件時，只需擴充 OrderContext 與 ShippingRule.CalculateFee。',
            '庫存扣減、付款介面與頁面顯示皆不需異動。',
          ],
          learningObjectives: ['用具體變更情境分析設計優劣'],
          rubricBasis: ['比較設計時需具體指出受修改影響的類別與原因'],
        },
        editable: {
          analogy: {
            story: '大樓換裝節能電燈時，只換燈泡模組，不用打掉整面牆重新拉配電箱。',
            mapping: '把運費計算留在 ShippingRule，就能在不動其他流程的情況下換規則。',
            boundary: '若連同訂單資料欄位都需要新增 IsVip，資料模型與計費兩處協調更新仍屬合理且可追蹤的範圍。',
          },
          plainExplanation: '在寫程式前做個 30 秒小實驗：「假設下個月老闆說 VIP 要免運、超商取貨改 60 元，我得改幾個檔案？」答案通常馬上浮現。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '比較設計：新增「VIP 免運」時的修改影響',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '模擬套用新需求：VIP 免運',
          steps: [
            {
              stepLabel: '設計 A（混在 Controller/UI）',
              actor: '若運費寫死在結帳頁面、PDF 報表與確認信三處',
              stateSnapshot: { 需改檔案數: '3 處以上', 風險: '容易漏改其中一處導致金額不一致' },
              explanation: '低內聚、散落重複邏輯，改動成本成倍增加。',
            },
            {
              stepLabel: '設計 B（集中在 ShippingRule）',
              actor: '將規則內聚於 ShippingRule.CalculateFee',
              stateSnapshot: { 需改檔案數: '1 個規則類 + 傳入 IsVip', 風險: '低（單一真實來源）' },
              explanation: '只需更新一處規則並補一筆 VIP 測試，所有呼叫端同步生效。',
              highlightLine: 7,
            },
          ],
        },
      },
      {
        slideId: 'ch3-s5',
        chapterId: 'ch3',
        order: 5,
        title: '得墨忒耳定律 (Law of Demeter)：別連串穿透別人的內部',
        contentVersion: 1,
        conceptIds: ['ch3.coupling'],
        corePoint: '避免 `order.Customer.Address.City.ZipCode` 這類火車殘骸式長鏈呼叫。',
        locked: {
          definition: '最少知識原則 (Law of Demeter) 建議物件只與直接朋友溝通，避免透過層層物件內部結構取得遠端屬性。',
          termMappings: [
            { termZh: '最少知識原則', termEn: 'Law of Demeter', meaning: '減少對合作物件內部結構階層的穿透依賴' },
          ],
          codeTitle: 'LawOfDemeter.cs',
          codeLanguage: 'csharp',
          code: `// 緊耦合長鏈：若 Address 改結構或為 null，呼叫端全爆掉
// var city = order.Customer.PrimaryAddress.City;

// 較佳做法：由 Order 提供明確查詢方法或封裝配送目的地
public class Order
{
    private readonly Customer _customer;
    public Order(Customer customer) => _customer = customer;

    public string GetShippingCity() => _customer.GetPreferredCity();
}`,
          expectedBehavior: [
            '呼叫端只需知道 order.GetShippingCity()，不需知道 Customer 裡面有沒有 PrimaryAddress 屬性。',
          ],
          learningObjectives: ['辨識過深的物件導航長鏈', '知道何時該提供委派方法'],
          rubricBasis: ['解釋長鏈呼叫如何讓中間結構重構波及大量外圍程式'],
        },
        editable: {
          analogy: {
            story: '寄包裹時你問宅配站「這筆訂單要寄哪裡」，而不是自己翻客戶資料夾、找他通訊錄再翻他租屋合約看地址。',
            mapping: 'GetShippingCity() 讓你只依賴一個直接問口，不用認識後面的整條結構樹。',
            boundary: 'LINQ 的流式查詢（`.Where(...).Select(...)`）是同型別串接，不算違反此原則。',
          },
          plainExplanation: '看到程式裡出現三個以上的點號連續挖深內部物件（例如 `a.B.C.D`），通常代表少了一個貼心的對話方法。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch3-s6',
        chapterId: 'ch3',
        order: 6,
        title: '高內聚與低耦合的平衡',
        contentVersion: 1,
        conceptIds: ['ch3.cohesion', 'ch3.coupling'],
        corePoint: '高內聚與低耦合是同一枚硬幣的兩面：模組內部緊密、模組之間邊界乾淨。',
        locked: {
          definition: '合理的系統設計追求「高內聚、低耦合」：把一起變動的邏輯聚在一起，把不同步變動的邏輯隔開並透過精簡介面溝通。',
          termMappings: [
            { termZh: '高內聚低耦合', termEn: 'High Cohesion, Low Coupling', meaning: '軟體模組劃分的核心品質指標' },
          ],
          codeTitle: 'BalanceSummary.cs',
          codeLanguage: 'csharp',
          code: `// 同一業務責任內聚（如 Order 狀態轉換），不同外部機制解耦
public sealed class Order
{
    public string OrderNo { get; }
    public bool IsPaid { get; private set; }
    public Order(string orderNo) => OrderNo = orderNo;
    public void MarkPaid()
    {
        if (IsPaid) throw new InvalidOperationException("不可重複付款");
        IsPaid = true;
    }
}`,
          expectedBehavior: ['Order 保護付款狀態轉換，但不直接依賴特定金流商 SDK。'],
          learningObjectives: ['綜合評估類別劃分是否達成高內聚低耦合'],
          rubricBasis: ['清楚區分內聚（內部相關性）與耦合（外部依賴度）的定義與關係'],
        },
        editable: {
          analogy: {
            story: '精密手錶的機芯零件緊密協作（高內聚），但更換錶帶只要卡榫一按就完成（低耦合）。',
            mapping: '該緊的留在類別裡，該鬆的交給邊界介面。',
            boundary: '設計初期別過度預測十年後的變化而無端製造大量空介面；等清楚看到「不同變更軸線」再切分即可。',
          },
          plainExplanation: '用一句話記住這章：**相關的聚一起（高內聚），無關的少牽連（低耦合）。**',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
    ],
  },
  {
    chapterId: 'ch4',
    order: 4,
    titleZh: '繼承與組合',
    titleEn: 'Inheritance & Composition',
    scenarioTitle: '會員折扣與通知機制 (Member & Notifier)',
    summary: '徹底釐清 is-a 與 has-a，理解為何繼承不是所有程式碼重用的預設答案。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch4.is_a_vs_has_a',
        chapterId: 'ch4',
        titleZh: 'is-a 繼承 vs has-a 組合',
        titleEn: 'Inheritance (is-a) vs Composition (has-a)',
        importanceWeight: 1.2,
        summary: '繼承表達「是一種」且遵守型別替換契約；組合表達「擁有某個能力」，可在執行期靈活更換。',
      },
      {
        conceptId: 'ch4.fragile_base_class',
        chapterId: 'ch4',
        titleZh: '繼承重用的陷阱與脆弱基底',
        titleEn: 'Fragile Base Class & Reuse Limits',
        importanceWeight: 1.2,
        summary: '僅為了少寫幾行重複程式而硬用繼承，會讓子類別暴露不該有的方法並綁死單一繼承鏈。',
      },
      {
        conceptId: 'ch4.liskov_substitution',
        chapterId: 'ch4',
        titleZh: '里氏替換原則 (LSP) 概念',
        titleEn: 'Liskov Substitution Principle',
        importanceWeight: 1,
        summary: '任何期待父類別的地方，換成子類別後不能破壞原本合理的行為與承諾。',
      },
    ],
    slides: [
      {
        slideId: 'ch4-s1',
        chapterId: 'ch4',
        order: 1,
        title: '繼承 (Inheritance) 的語意：is-a 與型別共用',
        contentVersion: 1,
        conceptIds: ['ch4.is_a_vs_has_a'],
        corePoint: 'C# 僅支援單一類別繼承；繼承的意義在於建立「是一種」的分類與行為契約，不只是省複製貼上。',
        locked: {
          definition: '繼承 (Inheritance) 讓衍生類別 (Derived Class) 延續基底類別 (Base Class) 的非私有成員與契約，且一個類別在 C# 中只能繼承一個基底類別。',
          termMappings: [
            { termZh: '基底類別', termEn: 'Base Class', meaning: '提供共同契約與基礎行為的父類別' },
            { termZh: '衍生類別', termEn: 'Derived Class', meaning: '繼承基底類別並可擴充或特化的子類別' },
          ],
          codeTitle: 'AccountHierarchy.cs',
          codeLanguage: 'csharp',
          code: `public abstract class MemberAccount
{
    public string Name { get; }
    protected MemberAccount(string name) => Name = name;
    public virtual decimal DiscountRate => 0m;
}

public class VipMemberAccount : MemberAccount
{
    public VipMemberAccount(string name) : base(name) { }
    public override decimal DiscountRate => 0.15m;
}`,
          expectedBehavior: [
            'VipMemberAccount 是一個 MemberAccount，可被當成 MemberAccount 傳入處理函式。',
          ],
          learningObjectives: ['寫出 C# 繼承語法與 : base(...) 建構子轉傳'],
          rubricBasis: ['正確理解單一繼承與 is-a 語意'],
        },
        editable: {
          analogy: {
            story: '「黃金會員帳戶」確實「是一種」會員帳戶，它天生具備會員姓名與折扣率這兩個本質屬性。',
            mapping: '因為兩者之間有真實的分類階層關係，用繼承很自然。',
            boundary: '如果只是「訂單需要寄信功能」，訂單並不是一種寄信器，這時候不能用繼承！',
          },
          plainExplanation: '別被教材上的「動物 -> 貓狗」麻痺了；寫實務系統時，「這個 A 真的永遠都是一種 B 嗎？」往往是否定的。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch4-s2',
        chapterId: 'ch4',
        order: 2,
        title: '為什麼繼承不是程式碼重用的預設答案？',
        contentVersion: 1,
        conceptIds: ['ch4.fragile_base_class'],
        corePoint: '當需求出現組合爆炸（如「VIP + 企業會員 + 雙重通知」）時，繼承樹會迅速失控。',
        locked: {
          definition: '為了單純重用工具方法而繼承會導致子類別繼承過多不相干方法、無法動態切換行為，且基底類別異動可能意外破壞子類別（脆弱基底類別問題）。',
          termMappings: [
            { termZh: '脆弱基底類別', termEn: 'Fragile Base Class', meaning: '修改父類別實作時在不知情下破壞子類別假設的風險' },
          ],
          codeTitle: 'InheritanceExplosion.cs',
          codeLanguage: 'csharp',
          code: `// 反例：把「折扣」與「通知」都用繼承硬湊，組合馬上爆炸：
// RegularEmailMember, RegularSmsMember, VipEmailMember, VipSmsMember...
// 更糟的是：會員在系統執行期升級成 VIP 時，物件無法原地換成別的子類別！`,
          expectedBehavior: [
            '一旦新增第 3 種折扣或第 3 種通知管道，類別數量呈乘積增加。',
            '現有實例無法在執行期從一般會員升級成 VIP，只能重建物件。',
          ],
          learningObjectives: ['說出繼承用於重用的三個具體缺陷'],
          rubricBasis: ['明確反駁「想重用程式就用繼承」的錯誤預設'],
        },
        editable: {
          analogy: {
            story: '如果把「穿毛衣、戴帽子、撐傘」做成基因遺傳，每種天氣組合都要誕生一個全新物種，而且出門後還不能脫外套。',
            mapping: '繼承是編譯期寫死的「基因」，組合才是出門後能隨意穿脫的「配件」。',
            boundary: '當行為一輩子固定且屬於核心分類本質（例如 UI 控制項基底或模板演算法骨架）時，繼承依然有價值。',
          },
          plainExplanation: '看到類別名稱越取越長（`VipAnnualHolidayEmailOrderService`），八成就是誤把該「組合」的變化維度全塞進繼承鏈了。',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
      {
        slideId: 'ch4-s3',
        chapterId: 'ch4',
        order: 3,
        title: '組合 (Composition)：has-a 帶來可抽換的彈性',
        contentVersion: 1,
        conceptIds: ['ch4.is_a_vs_has_a'],
        corePoint: '把會變動的策略抽成獨立元件讓主物件「擁有它」，就能自由搭配也能動態替換。',
        locked: {
          definition: '組合 (Composition) 是在類別內部持有另一物件（或介面）的參考，透過委派 (Delegation) 呼叫其能力，遵循「優先使用組合而非繼承」。',
          termMappings: [
            { termZh: '組合', termEn: 'Composition', meaning: '透過欄位持有協作物件 (has-a) 來達成重用與擴充' },
            { termZh: '委派', termEn: 'Delegation', meaning: '將特定工作轉交給內部持有的協作物件處理' },
          ],
          codeTitle: 'MemberComposition.cs',
          codeLanguage: 'csharp',
          code: `public interface IDiscountPolicy
{
    decimal Apply(decimal amount);
}

public class VipDiscount : IDiscountPolicy
{
    public decimal Apply(decimal amount) => amount * 0.85m;
}

public class Member
{
    private IDiscountPolicy _discountPolicy;
    public string Name { get; }

    public Member(string name, IDiscountPolicy discountPolicy)
    {
        Name = name;
        _discountPolicy = discountPolicy;
    }

    public void UpgradePolicy(IDiscountPolicy nextPolicy) => _discountPolicy = nextPolicy;
    public decimal Checkout(decimal amount) => _discountPolicy.Apply(amount);
}`,
          expectedBehavior: [
            '同一個 Member 實例可在執行期透過 UpgradePolicy() 升級折扣方案。',
            'Member 與折扣計算各自獨立，類別數量為線性相加而非乘積爆炸。',
          ],
          learningObjectives: ['用 has-a 組合重構多維度變化', '實作執行期可替換的委派設計'],
          rubricBasis: ['能展示組合如何支援動態切換並降低類別耦合'],
        },
        editable: {
          analogy: {
            story: '筆電本身有螢幕和鍵盤，裡面再插上一張「GPU 顯示卡」跟一張「網卡」；需要升級時換顯示卡，不用把整台筆電換掉。',
            mapping: 'Member 透過 _discountPolicy 欄位插上折扣模組，升級時換掉這張卡就好。',
            boundary: '組合會多寫一點轉接呼叫程式碼（委派），在完全沒有變化需求的小物件上不需硬拆。',
          },
          plainExplanation: '這就是設計模式最常說的「Favor composition over inheritance（多用組合，少用繼承）」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '比較設計：會員當場升級為 VIP 的需求變更',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '推演執行期升級策略',
          steps: [
            {
              stepLabel: '1. 建立一般會員',
              actor: 'var m = new Member("林小海", new RegularDiscount());',
              stateSnapshot: { Name: '"林小海"', Policy: 'RegularDiscount (100%)', 'Checkout(1000)': '1000' },
              explanation: '以一般折扣政策建立物件。',
              highlightLine: 15,
            },
            {
              stepLabel: '2. 執行期升級 VIP',
              actor: 'm.UpgradePolicy(new VipDiscount());',
              stateSnapshot: { Name: '"林小海"', Policy: 'VipDiscount (85%)', 'Checkout(1000)': '850' },
              explanation: '不必銷毀重建 Member 實例，只替換內部組合的策略物件即生效。',
              highlightLine: 21,
            },
          ],
        },
      },
      {
        slideId: 'ch4-s4',
        chapterId: 'ch4',
        order: 4,
        title: '里氏替換原則 (LSP)：不能欺騙父類別的承諾',
        contentVersion: 1,
        conceptIds: ['ch4.liskov_substitution'],
        corePoint: '如果子類別必須把父類別方法改寫成「拋出 NotSupportedException」，代表這組繼承關係設計錯了。',
        locked: {
          definition: '里氏替換原則 (Liskov Substitution Principle, LSP) 要求衍生類別必須完全相容基底類別的契約，不可削弱前置條件或破壞承諾的行為。',
          termMappings: [
            { termZh: '里氏替換原則', termEn: 'Liskov Substitution Principle (LSP)', meaning: '子型別物件必須能無縫替換父型別而不使程式行為出錯' },
          ],
          codeTitle: 'LspViolation.cs',
          codeLanguage: 'csharp',
          code: `// 違反 LSP 的經典案例：唯讀檔案卻繼承自可讀寫 FileStorage
public class FileStorage
{
    public virtual void Save(string content) { /* 寫入檔案 */ }
}

public class ReadOnlyStorage : FileStorage
{
    public override void Save(string content)
        => throw new NotSupportedException("唯讀模式不能存檔！");
}
// 正解：拆成 IReadableStorage 與 IWritableStorage，各自實作！`,
          expectedBehavior: [
            '任何接受 FileStorage 的函式以為能呼叫 Save()，傳入 ReadOnlyStorage 卻當場崩潰。',
          ],
          learningObjectives: ['辨識違反 LSP 的繼承階層', '以小介面或組合修正契約衝突'],
          rubricBasis: ['能指出子類別拋出 NotSupportedException 代表父類別契約過寬或不當繼承'],
        },
        editable: {
          analogy: {
            story: '合約上寫著「所有門市都支援刷卡」，結果某間分店貼告示「本店收現金，刷卡機是裝飾品」——客人刷卡直接卡關。',
            mapping: 'ReadOnlyStorage 假裝自己是可寫入的 FileStorage，卻在真正呼叫 Save() 時拒絕服務。',
            boundary: '若本來就預期「可能拒絕」並回傳 TrySave() bool 結果，那屬合法契約的一部分；突然丟出未預期的異常才算違約。',
          },
          plainExplanation: '檢查繼承有沒有寫壞的快速標準：你的子類別裡有沒有某個 override 寫成 `throw new NotSupportedException()` 或空白什麼都不做？',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch4-s5',
        chapterId: 'ch4',
        order: 5,
        title: 'sealed 關鍵字：有意識地終止繼承',
        contentVersion: 1,
        conceptIds: ['ch4.fragile_base_class'],
        corePoint: '若一個類別沒有為繼承而設計，加上 sealed 可避免未來被任意繼承造成脆弱依賴。',
        locked: {
          definition: 'C# 的 sealed 修飾詞可防止類別被其他類別繼承，明確宣告此類別的擴充點應透過組合或介面，而非子類別覆寫。',
          termMappings: [
            { termZh: '密封類別', termEn: 'sealed class', meaning: '禁止被繼承的類別，有助於穩定邊界與編譯器最佳化' },
          ],
          codeTitle: 'SealedService.cs',
          codeLanguage: 'csharp',
          code: `public sealed class ReceiptFormatter
{
    public string Format(string orderNo, decimal total)
        => $"訂單 {orderNo} 總計 NT$ {total:N0}";
}`,
          expectedBehavior: ['其他類別無法 `: ReceiptFormatter`，只能透過欄位組合使用它。'],
          learningObjectives: ['了解 sealed 在大型 C# 專案中的設計表態'],
          rubricBasis: ['知道 sealed 代表禁止繼承，引導使用者改採組合'],
        },
        editable: {
          analogy: {
            story: 'USB 隨身碟做成密封外殼：你可以插進任何電腦使用（組合），但廠商不建議你自行撬開焊線路（繼承改寫內部）。',
            mapping: 'sealed 清楚告訴團隊同事：請直接使用或組合這個工具，不要繼承它。',
            boundary: '如果需要為測試建立替身 (Mock/Fake)，通常應該依賴介面 `IReceiptFormatter` 而非去繼承實作類別。',
          },
          plainExplanation: '現代 C# 實務常建議：「沒打算當父類別的服務類，預設加上 sealed」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch4-s6',
        chapterId: 'ch4',
        order: 6,
        title: '決策指引：何時選繼承、何時選組合？',
        contentVersion: 1,
        conceptIds: ['ch4.is_a_vs_has_a', 'ch4.fragile_base_class', 'ch4.liskov_substitution'],
        corePoint: '四個快篩問題幫你做決定：概念語意、執行期切換、多維度組合、與父類穩定度。',
        locked: {
          definition: '僅當滿足嚴格 is-a 語意、遵守 LSP 且共享不變的核心模板流程時使用繼承；其餘重用與多維擴充應優先採用組合。',
          termMappings: [
            { termZh: '設計取捨', termEn: 'Design Trade-off', meaning: '根據變更方向決定採用階層繼承或元件組合' },
          ],
          codeTitle: 'SelectionGuide.cs',
          codeLanguage: 'csharp',
          code: `// 適合組合：NotificationService「擁有」多個傳送器與格式化器
public sealed class NotificationService
{
    private readonly IMessageFormatter _formatter;
    private readonly IChannelSender _sender;

    public NotificationService(IMessageFormatter formatter, IChannelSender sender)
    {
        _formatter = formatter;
        _sender = sender;
    }

    public void Notify(string user, string rawMessage)
        => _sender.Send(user, _formatter.Format(rawMessage));
}`,
          expectedBehavior: ['格式與管道完全獨立，任意搭配不產生新子類別。'],
          learningObjectives: ['面對實務需求能講出為何選組合而非繼承'],
          rubricBasis: ['能舉出具體業務理由進行繼承與組合的取捨'],
        },
        editable: {
          analogy: {
            story: '蓋房子時，柱子跟梁的受力結構有固定工程規格；裡面的冷氣、音響、燈具全採用標準插座組合安裝。',
            mapping: '固定骨架少數時候可用抽象基底，可換零件一定用組合。',
            boundary: '若發現繼承深度超過兩到三層，幾乎可以確定該停下來重構為組合了。',
          },
          plainExplanation: '記住一個口訣：**「能用 has-a 解決，就不輕易用 is-a。」**',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
    ],
  },
  {
    chapterId: 'ch5',
    order: 5,
    titleZh: '介面與抽象類別',
    titleEn: 'Interface & Abstract Class',
    scenarioTitle: '金流閘道與報表匯出 (Payment & Report)',
    summary: '分清楚「純能力契約 (Interface)」與「共享部分實作的模板基底 (Abstract Class)」的適用需求。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch5.interface_contract',
        chapterId: 'ch5',
        titleZh: '介面作為純契約 (Capability Contract)',
        titleEn: 'Interface Contract',
        importanceWeight: 1.2,
        summary: 'Interface 定義「能做什麼 (can-do)」，不限制實作者的家族血緣，且一個類別可實作多個介面。',
      },
      {
        conceptId: 'ch5.abstract_template',
        chapterId: 'ch5',
        titleZh: '抽象類別共享共同骨架',
        titleEn: 'Abstract Class & Shared State',
        importanceWeight: 1.2,
        summary: 'Abstract Class 不能直接 new，適合在緊密相關的家族間共享實例欄位、建構子與部分共同流程。',
      },
      {
        conceptId: 'ch5.isp_segregation',
        chapterId: 'ch5',
        titleZh: '介面隔離原則 (ISP)',
        titleEn: 'Interface Segregation Principle',
        importanceWeight: 1,
        summary: '與其做一個龐大的萬能介面逼大家實作不需要的方法，不如拆成專職小介面。',
      },
    ],
    slides: [
      {
        slideId: 'ch5-s1',
        chapterId: 'ch5',
        order: 1,
        title: '介面 (Interface)：定義「能做什麼」的契約',
        contentVersion: 1,
        conceptIds: ['ch5.interface_contract'],
        corePoint: '介面不關心你是誰、繼承了誰，只要求你保證提供這組方法簽章。',
        locked: {
          definition: '介面 (Interface) 宣告一組必須由實作型別提供的成員契約；C# 類別可同時實作多個介面，且呼叫端只依賴契約而不依賴實作細節。',
          termMappings: [
            { termZh: '介面', termEn: 'Interface', meaning: '定義能力契約的型別，在 C# 慣例以 I 開頭（如 IPaymentGateway）' },
            { termZh: '多重實作', termEn: 'Multiple Interface Implementation', meaning: '單一類別可同時實作多份介面契約' },
          ],
          codeTitle: 'IPaymentGateway.cs',
          codeLanguage: 'csharp',
          code: `public interface IPaymentGateway
{
    string ProviderName { get; }
    bool Charge(string orderNo, decimal amount);
}

public sealed class LinePayGateway : IPaymentGateway
{
    public string ProviderName => "LINE Pay";
    public bool Charge(string orderNo, decimal amount) => amount > 0;
}

public sealed class CreditCardGateway : IPaymentGateway
{
    public string ProviderName => "CreditCard";
    public bool Charge(string orderNo, decimal amount) => amount > 0 && amount <= 200_000m;
}`,
          expectedBehavior: [
            '結帳流程只要接收 IPaymentGateway，就能無縫切換 LINE Pay 或信用卡實作。',
          ],
          learningObjectives: ['定義並實作 C# interface', '理解介面如何解除具體實作綁定'],
          rubricBasis: ['介面表達跨類別的能力契約，可多重實作'],
        },
        editable: {
          analogy: {
            story: '台灣 110V 雙孔插座規格就是 Interface：電扇、檯燈、筆電充電器長得完全不同，但只要插頭符合規格都能供電。',
            mapping: '牆上插座是 IPaymentGateway，各家金流則是不同電器。',
            boundary: 'C# 8 起雖有預設介面方法，但介面仍不該用來儲存實例欄位狀態；若需要共享狀態請用抽象類別。',
          },
          plainExplanation: '取名字時有個小訣竅：介面常以「能做什麼」命名（如 `IPaymentGateway`, `ISearchable`），不預設大家的內部實作相同。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch5-s2',
        chapterId: 'ch5',
        order: 2,
        title: '抽象類別 (Abstract Class)：共享狀態與模板流程',
        contentVersion: 1,
        conceptIds: ['ch5.abstract_template'],
        corePoint: '當一群相關物件共用相同的步驟順序與基礎欄位，只差在某幾個子步驟不同，適合用抽象類別。',
        locked: {
          definition: '抽象類別 (Abstract Class) 不可直接實例化，可包含實作完畢的方法、protected 狀態欄位、建構子，以及強制子類別實作的 abstract 方法。',
          termMappings: [
            { termZh: '抽象類別', termEn: 'Abstract Class', meaning: '提供部分共同實作與抽象契約的不完整基底類別' },
            { termZh: '模板方法模式', termEn: 'Template Method Pattern', meaning: '父類別固定演算法骨架，將特定步驟留給子類別覆寫' },
          ],
          codeTitle: 'ReportExporterBase.cs',
          codeLanguage: 'csharp',
          code: `public abstract class ReportExporterBase
{
    protected string GeneratedBy { get; }
    protected ReportExporterBase(string generatedBy) => GeneratedBy = generatedBy;

    // 固定整體流程骨架（不可隨意打亂步驟）
    public string Export(IReadOnlyList<string> rows)
    {
        var header = $"報表產生者：{GeneratedBy}\n";
        var body = FormatRows(rows);
        return header + body;
    }

    protected abstract string FormatRows(IReadOnlyList<string> rows);
}

public sealed class CsvReportExporter : ReportExporterBase
{
    public CsvReportExporter(string by) : base(by) { }
    protected override string FormatRows(IReadOnlyList<string> rows)
        => string.Join("\n", rows);
}`,
          expectedBehavior: [
            'new ReportExporterBase("admin") 會編譯錯誤，只能建立具體子類別如 CsvReportExporter。',
            '所有子類別皆自動繼承統一的報表表頭組裝邏輯。',
          ],
          learningObjectives: ['使用 abstract class 與 abstract method', '識別適合使用模板骨架的時機'],
          rubricBasis: ['能舉出抽象類別可擁有建構子、實例欄位與固定流程骨架的特色'],
        },
        editable: {
          analogy: {
            story: '連鎖餐廳的「出餐SOP手冊」規定一定要先點餐、核對過敏原、出餐（Export），但「實際料理方式」依門市是拉麵店還是咖哩店各自實作（FormatRows）。',
            mapping: '共用的表頭與 SOP 放在抽象基底，差異化的格式交給子類別 override。',
            boundary: '正因為它使用了繼承，一個類別只能繼承一個抽象類別，請確認子類別確實屬於同一家族。',
          },
          plainExplanation: '抽象類別像「半成品模板」，幫子類別把重複的骨架與欄位寫好；介面則是「純規格書」，一行欄位都沒有。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '推演模板方法執行順序',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '推演 CsvReportExporter.Export()',
          steps: [
            {
              stepLabel: '1. 建立子類別實例',
              actor: 'ReportExporterBase exporter = new CsvReportExporter("財務組");',
              stateSnapshot: { GeneratedBy: '"財務組"', 實際型別: 'CsvReportExporter' },
              explanation: '子類別建構子透過 : base(by) 初始化抽象類別的 protected 欄位。',
              highlightLine: 19,
            },
            {
              stepLabel: '2. 呼叫基底骨架方法',
              actor: 'var output = exporter.Export(new[] { "A,100", "B,200" });',
              stateSnapshot: { Step1: '產生表頭 "報表產生者：財務組"', Step2: '分派至 CsvReportExporter.FormatRows' },
              explanation: '基底類控制順序，執行到 abstract FormatRows 時自動呼叫子類別實作。',
              highlightLine: 7,
            },
          ],
        },
      },
      {
        slideId: 'ch5-s3',
        chapterId: 'ch5',
        order: 3,
        title: 'Interface vs Abstract Class 核心差異總覽',
        contentVersion: 1,
        conceptIds: ['ch5.interface_contract', 'ch5.abstract_template'],
        corePoint: '從「狀態欄位、多重實作、建構子、設計意圖」四個維度明確區分兩者。',
        locked: {
          definition: '介面定義跨家族的能力契約並支援多重實作，無法宣告實例欄位與建構子；抽象類別支援實例欄位、建構子與共用實作，但受限於單一繼承。',
          termMappings: [
            { termZh: '實例狀態', termEn: 'Instance State', meaning: '物件擁有的實際欄位值，抽象類別可宣告、傳統介面不可' },
          ],
          codeTitle: 'InterfaceVsAbstract.cs',
          codeLanguage: 'csharp',
          code: `// 類別可同時具備「金流」與「可查詢狀態」兩種毫不相干的能力
public interface IRefundable { bool Refund(string txId); }

public sealed class StripeGateway : IPaymentGateway, IRefundable
{
    public string ProviderName => "Stripe";
    public bool Charge(string orderNo, decimal amount) => true;
    public bool Refund(string txId) => true;
}`,
          expectedBehavior: ['StripeGateway 同時滿足兩個獨立契約，且可選擇性不讓超商代碼繳費實作 IRefundable。'],
          learningObjectives: ['比較 Interface 與 Abstract Class 的四項語法與語意差異'],
          rubricBasis: ['準確列舉多重實作、狀態欄位、建構子與設計意圖差異'],
        },
        editable: {
          analogy: {
            story: '「會開車 (IDrivable)」與「會游泳 (ISwimmable)」是兩張證照（介面），一個人可以同時考兩張；但「哺乳類」是單一血統樹（抽象基底）。',
            mapping: '考取不同證照不需要改變你的家族血緣。',
            boundary: '實務中常「先寫介面定義契約，再用抽象類別提供共用的預設基底實作（例如 Stream -> FileStream）」。',
          },
          plainExplanation: '選型一句話：**需要跨類別能力契約選 Interface；需要共用欄位狀態與流程骨架選 Abstract Class。**',
          detailLevel: 'standard',
          layoutVariant: 'comparison_columns',
        },
      },
      {
        slideId: 'ch5-s4',
        chapterId: 'ch5',
        order: 4,
        title: '介面隔離原則 (ISP)：拒絕胖介面',
        contentVersion: 1,
        conceptIds: ['ch5.isp_segregation'],
        corePoint: '別逼「超商取貨付款」實作「信用卡分期期數」方法；拆成細緻小介面更乾淨。',
        locked: {
          definition: '介面隔離原則 (Interface Segregation Principle, ISP) 指出不應強迫客戶端或實作類別依賴它們不使用的方法。',
          termMappings: [
            { termZh: '介面隔離原則', termEn: 'Interface Segregation Principle (ISP)', meaning: '將龐大介面拆解為多個高內聚的小型角色介面' },
          ],
          codeTitle: 'SegregatedInterfaces.cs',
          codeLanguage: 'csharp',
          code: `// 反例：把所有功能塞進 IPaymentAllInOne，超商條碼只好對 Refund 丟例外
// 正解：拆分角色介面
public interface IChargeable { bool Charge(string orderNo, decimal amount); }
public interface IInstallmentCapable { int MaxInstallments { get; } }

public sealed class ConvenienceStorePay : IChargeable
{
    public bool Charge(string orderNo, decimal amount) => amount <= 20_000m;
}`,
          expectedBehavior: ['ConvenienceStorePay 不必實作不相干的分期或退款方法，避免製造假實作。'],
          learningObjectives: ['將胖介面依呼叫端需求拆分成精簡契約'],
          rubricBasis: ['能說明大介面強迫實作無關方法如何導致與 LSP 衝突的壞味道'],
        },
        editable: {
          analogy: {
            story: '把影印機、咖啡機、碎紙機全綁在同一個開關介面上，只想印文件卻得先填咖啡豆水位參數。',
            mapping: '拆成獨立小介面，讓每個實作只承擔自己真正提供的能力。',
            boundary: '拆太碎變成每個介面都只有一個無關連的方法（過度碎片化）也會增加閱讀成本，需依呼叫端真實使用場景劃分。',
          },
          plainExplanation: '當某個介面有 8 個方法，但實作它的類別每次都只用其中 2 個、剩下 6 個寫 `throw new NotImplementedException()`，就是該拆介面的時候了。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch5-s5',
        chapterId: 'ch5',
        order: 5,
        title: '顯式介面實作與契約安全',
        contentVersion: 1,
        conceptIds: ['ch5.interface_contract'],
        corePoint: '當兩個介面剛好有同名方法時，C# 可透過顯式實作 (Explicit Implementation) 精準區隔。',
        locked: {
          definition: '顯式介面實作讓某方法僅在物件透過該介面型別存取時才可見，可解決多介面命名衝突並隱藏不常用的契約方法。',
          termMappings: [
            { termZh: '顯式介面實作', termEn: 'Explicit Interface Implementation', meaning: '以 InterfaceName.Method() 形式實作，僅透過介面參考可呼叫' },
          ],
          codeTitle: 'ExplicitInterface.cs',
          codeLanguage: 'csharp',
          code: `public interface ILocalAudit { string Export(); }
public interface ICloudBackup { string Export(); }

public sealed class SyncLog : ILocalAudit, ICloudBackup
{
    string ILocalAudit.Export() => "local-audit-json";
    string ICloudBackup.Export() => "cloud-backup-json";
}`,
          expectedBehavior: [
            '((ILocalAudit)log).Export() 回傳 "local-audit-json"；((ICloudBackup)log).Export() 回傳 "cloud-backup-json"。',
          ],
          learningObjectives: ['認識顯式介面實作解決命名衝突的語法'],
          rubricBasis: ['了解多介面同名衝突的 C# 處理機制'],
        },
        editable: {
          analogy: {
            story: '同一位工程師在公司用員工證刷門禁，回家用社區磁扣開大門；雖然都叫「刷卡」，對應不同情境有不同行為。',
            mapping: '用介面型別轉換就像拿出對應那張識別證。',
            boundary: '日常情況優先使用一般 public 隱式實作較直觀，僅在撞名或刻意隱藏時使用顯式實作。',
          },
          plainExplanation: '知道 C# 有這個語法即可，遇到兩個第三方介面都叫 `Save()` 或 `Close()` 時就能立刻派上用場。',
          detailLevel: 'concise',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch5-s6',
        chapterId: 'ch5',
        order: 6,
        title: '兩者併用：介面作為契約 + 抽象類別作為共用基底',
        contentVersion: 1,
        conceptIds: ['ch5.interface_contract', 'ch5.abstract_template'],
        corePoint: '對外呼叫端只認介面契約，內部實作團隊則用抽象類別減少重複樣板碼。',
        locked: {
          definition: '大型系統常以介面宣告對外穩定契約，同時提供一個實作該介面的抽象基底類別，封裝重複的驗證、日誌或共用欄位。',
          termMappings: [
            { termZh: '契約與基底並用', termEn: 'Interface + Abstract Base Pattern', meaning: '對外依賴介面保持最大彈性，對內用抽象類別消除重複骨架' },
          ],
          codeTitle: 'CombinedPattern.cs',
          codeLanguage: 'csharp',
          code: `public interface IExporter { string Export(string title); }

public abstract class ExporterBase : IExporter
{
    public string Export(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("標題不可空");
        return BuildContent(title.Trim());
    }
    protected abstract string BuildContent(string cleanTitle);
}

public sealed class MarkdownExporter : ExporterBase
{
    protected override string BuildContent(string cleanTitle) => $"# {cleanTitle}";
}`,
          expectedBehavior: [
            '呼叫端只需依賴 IExporter（甚至可輕鬆寫純記憶體測試替身而不必繼承 ExporterBase）。',
            '標準實作類別繼承 ExporterBase 即可共用標題檢查邏輯。',
          ],
          learningObjectives: ['結合介面與抽象類別各自的優點'],
          rubricBasis: ['說明為何對外依賴介面同時對內可提供抽象共用基底'],
        },
        editable: {
          analogy: {
            story: '外送平台對餐廳簽標準合作合約（IExporter），同時也提供公版平板點餐模板（ExporterBase）給想省事的店家套用。',
            mapping: '想套公版的店家繼承 ExporterBase，想完全自研 POS 的連鎖店只要遵守 IExporter 合約即可。',
            boundary: '小型專案若目前只有一兩個實作且沒有複雜共用步驟，直接實作介面即可。',
          },
          plainExplanation: '這是 .NET Core 標準函式庫非常常用的優雅組合：對外看介面，對內看需要才抽共用基底。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
    ],
  },
];
