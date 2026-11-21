import type { CanonicalChapter } from '../../domain/types.ts';

export const CHAPTERS_6_TO_9: CanonicalChapter[] = [
  {
    chapterId: 'ch6',
    order: 6,
    titleZh: '多型',
    titleEn: 'Polymorphism',
    scenarioTitle: '多管道通知與運費策略 (Notifier & Shipping)',
    summary: '同一句方法呼叫，依執行期實際物件型別自動分派不同行為；掌握 virtual/override 與 new 遮蔽差異。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch6.runtime_dispatch',
        chapterId: 'ch6',
        titleZh: '執行期動態分派',
        titleEn: 'Runtime Polymorphic Dispatch',
        importanceWeight: 1.2,
        summary: '透過基底型別或介面參考呼叫方法時，實際執行的是物件真實型別所實作的版本。',
      },
      {
        conceptId: 'ch6.virtual_override_vs_new',
        chapterId: 'ch6',
        titleZh: 'virtual/override 與 new 隱藏的關鍵差異',
        titleEn: 'virtual/override vs. Method Hiding',
        importanceWeight: 1.2,
        summary: '只有 virtual + override 會產生真多型分派；用 new 只是名稱遮蔽，透過父類參考呼叫仍會跑舊版。',
      },
      {
        conceptId: 'ch6.open_closed',
        chapterId: 'ch6',
        titleZh: '開放封閉原則 (OCP)',
        titleEn: 'Open/Closed Principle',
        importanceWeight: 1,
        summary: '新增一種通知管道或運費策略時，只需新增一個類別，不必回去修改巨大的 if/else 或 switch。',
      },
    ],
    slides: [
      {
        slideId: 'ch6-s1',
        chapterId: 'ch6',
        order: 1,
        title: '什麼是多型 (Polymorphism)？',
        contentVersion: 1,
        conceptIds: ['ch6.runtime_dispatch'],
        corePoint: '呼叫端面對統一抽象型別，同一行 `notifier.Notify(...)` 卻能在執行期跑出截然不同的行為。',
        locked: {
          definition: '多型 (Polymorphism) 指透過共同的父類別或介面參考呼叫方法時，程式會在執行期依據物件實際型別分派對應的實作版本。',
          termMappings: [
            { termZh: '多型', termEn: 'Polymorphism', meaning: '同一介面／呼叫形式在不同實作物件上展現不同行為的能力' },
            { termZh: '動態分派', termEn: 'Dynamic Dispatch', meaning: '在執行期依物件真實型別決定要執行的覆寫方法' },
          ],
          codeTitle: 'PolymorphicNotifiers.cs',
          codeLanguage: 'csharp',
          code: `public interface INotifier
{
    string ChannelName { get; }
    void Send(string recipient, string message);
}

public sealed class EmailNotifier : INotifier
{
    public string ChannelName => "Email";
    public void Send(string recipient, string message)
        => Console.WriteLine($"[Email -> {recipient}] {message}");
}

public sealed class SmsNotifier : INotifier
{
    public string ChannelName => "SMS";
    public void Send(string recipient, string message)
        => Console.WriteLine($"[SMS -> {recipient}] {message}");
}

// 呼叫端完全不用寫 if (type == "Email") ...
foreach (INotifier notifier in notifiers)
{
    notifier.Send(user, "您的訂位已確認");
}`,
          expectedBehavior: [
            '迴圈內同樣呼叫 notifier.Send(...)，第一輪執行 EmailNotifier，第二輪執行 SmsNotifier。',
          ],
          learningObjectives: ['利用介面實現多型呼叫迴圈', '了解編譯期型別與執行期實際型別的差別'],
          rubricBasis: ['準確說明同一抽象呼叫在執行期依實際物件型別分派實作'],
        },
        editable: {
          analogy: {
            story: '音樂廳指揮舉起手勢（同一個介面呼叫），小提琴手拉琴弦、長號手吹銅管、定音鼓手敲鼓面（各自的多型行為）。',
            mapping: '指揮不需要知道每種樂器的指法細節，只需發出一致的節拍訊號。',
            boundary: '多型能消除「依型別分支的 switch」，但不代表程式裡完全不能有 if/else（如一般數值條件判斷）。',
          },
          plainExplanation: '多型讓你從「到處檢查型別再決定呼叫誰」，變成「直接叫它做就對了，物件自己知道怎麼做」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '追蹤迴圈中的多型執行期分派',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '推演 foreach 迴圈逐筆分派',
          steps: [
            {
              stepLabel: '1. 第 1 筆：EmailNotifier',
              actor: 'notifier.Send("amy@ex.com", "已確認")',
              stateSnapshot: { 宣告型別: 'INotifier', 實際型別: 'EmailNotifier', 分派目標: 'EmailNotifier.Send' },
              explanation: '依真實物件查詢實作，執行 Email 發送。',
              highlightLine: 10,
            },
            {
              stepLabel: '2. 第 2 筆：SmsNotifier',
              actor: 'notifier.Send("0912-000", "已確認")',
              stateSnapshot: { 宣告型別: 'INotifier', 實際型別: 'SmsNotifier', 分派目標: 'SmsNotifier.Send' },
              explanation: '同一行呼叫程式碼，自動改分派至簡訊實作。',
              highlightLine: 17,
            },
          ],
        },
      },
      {
        slideId: 'ch6-s2',
        chapterId: 'ch6',
        order: 2,
        title: 'virtual 與 override：C# 類別繼承的多型機制',
        contentVersion: 1,
        conceptIds: ['ch6.virtual_override_vs_new'],
        corePoint: 'C# 預設方法不開放覆寫；父類別必須明確加上 virtual（或 abstract），子類別以 override 覆寫才構成多型。',
        locked: {
          definition: '在 C# 中，基底類別方法預設為非虛擬 (non-virtual)；必須標記 virtual 或 abstract，衍生類別再以 override 改寫，才能於基底型別參考下觸發多型分派。',
          termMappings: [
            { termZh: '虛擬方法', termEn: 'virtual', meaning: '允許衍生類別以 override 改寫實作的基底方法' },
            { termZh: '覆寫', termEn: 'override', meaning: '提供虛擬或抽象方法的新實作，參與執行期動態分派' },
          ],
          codeTitle: 'ShippingVirtualOverride.cs',
          codeLanguage: 'csharp',
          code: `public class ShippingCalculator
{
    public virtual decimal Calculate(decimal weightKg) => 60m + weightKg * 15m;
}

public sealed class ExpressShippingCalculator : ShippingCalculator
{
    public override decimal Calculate(decimal weightKg) => base.Calculate(weightKg) + 50m;
}

ShippingCalculator calc = new ExpressShippingCalculator();
decimal fee = calc.Calculate(2m); // 60 + 30 + 50 = 140`,
          expectedBehavior: [
            '即使變數 calc 宣告為 ShippingCalculator，因使用 virtual/override，仍執行 ExpressShippingCalculator.Calculate 得出 140。',
          ],
          learningObjectives: ['正確配對 virtual 與 override', '透過 base.Method() 重用父類計算'],
          rubricBasis: ['C# 方法預設非虛擬，必須 virtual + override 才有動態分派'],
        },
        editable: {
          analogy: {
            story: '總部規定一般門市運費計算公式，但特別在合約留一條「加註條款 (virtual)」，讓離島或急件分店可以覆寫 (override) 加上加急費。',
            mapping: '沒有事先在父類別標記 virtual 的方法，子類別不能擅自 override，避免意外被改寫。',
            boundary: '若連預設實作都沒有，直接使用 abstract 會比硬寫一個假的 virtual 空方法更明確。',
          },
          plainExplanation: '和 Java 預設所有方法都能覆寫不同，C# 是刻意要求你用 `virtual` 表態，提醒開發者「這裡是開放給子類別調整的擴充點」。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch6-s3',
        chapterId: 'ch6',
        order: 3,
        title: '小心陷阱！override 與 new 隱藏 (Method Hiding) 的差別',
        contentVersion: 1,
        conceptIds: ['ch6.virtual_override_vs_new'],
        corePoint: '忘記寫 override 卻用了 new，多型會直接失效：用父類別參考呼叫時會跑回父類別的版本！',
        locked: {
          definition: '在子類別方法加上 new 修飾詞僅是「名稱隱藏 (Method Hiding)」，不建立多型覆寫；呼叫哪個版本取決於變數的編譯期型別，而非物件實際型別。',
          termMappings: [
            { termZh: '方法隱藏', termEn: 'Method Hiding (new)', meaning: '在子類別建立同名新方法遮蔽父類別，無執行期多型分派' },
          ],
          codeTitle: 'OverrideVsNewTrap.cs',
          codeLanguage: 'csharp',
          code: `public class BaseRule
{
    public virtual string Name() => "Base";
    public string Tag() => "BaseTag"; // 非 virtual
}

public class CustomRule : BaseRule
{
    public override string Name() => "Custom"; // 真多型覆寫
    public new string Tag() => "CustomTag";   // 只是遮蔽！
}

BaseRule refAsBase = new CustomRule();
// refAsBase.Name() -> "Custom"   (依實際物件型別)
// refAsBase.Tag()  -> "BaseTag"  (依變數宣告型別 BaseRule！)`,
          expectedBehavior: [
            'refAsBase.Name() 回傳 "Custom"。',
            'refAsBase.Tag() 回傳 "BaseTag"，即使物件實際上是 CustomRule。',
          ],
          learningObjectives: ['精準推演 refAsBase 呼叫 override 與 new 的輸出結果'],
          rubricBasis: ['能區分執行期實際型別分派 (override) 與編譯期宣告型別解析 (new)'],
        },
        editable: {
          analogy: {
            story: '你改了門牌上的綽號 (new)，但郵差還是照戶政名冊上的宣告名稱 (BaseRule) 寄信，信封上寫什麼名字就走哪條路線。',
            mapping: 'new 只在「直接把變數宣告成 CustomRule」時才看得到新方法，放進父類別清單就失靈了。',
            boundary: '實務上除非維護無法修改的第三方舊基底類別，否則幾乎不應該用 new 隱藏父類別方法。',
          },
          plainExplanation: '這是 C# 面試和實務除錯的經典地雷。看到編譯器提示 CS0108 警告「hides inherited member; use the new keyword if hiding was intended」時，通常你真正想寫的是 `virtual` + `override`。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch6-s4',
        chapterId: 'ch6',
        order: 4,
        title: '消除脆弱的 switch 分支：實踐開放封閉原則 (OCP)',
        contentVersion: 1,
        conceptIds: ['ch6.open_closed', 'ch6.runtime_dispatch'],
        corePoint: '把 `switch (channelType)` 重構為多型物件集合，讓擴充新管道不用修改既有核心流程。',
        locked: {
          definition: '開放封閉原則 (Open/Closed Principle, OCP) 主張軟體單元應對擴充開放、對修改既有穩定程式碼封閉；多型是實現 OCP 的重要手段。',
          termMappings: [
            { termZh: '開放封閉原則', termEn: 'Open/Closed Principle (OCP)', meaning: '透過新增實作來擴充新行為，盡量不修改已經測試穩定的呼叫流程' },
          ],
          codeTitle: 'OcpShippingRefactor.cs',
          codeLanguage: 'csharp',
          code: `// 擴充新運費方案時，不需更改 CheckoutFeeSummary 的迴圈或核心程式碼
public interface IShippingStrategy
{
    string Code { get; }
    decimal Compute(decimal subtotal);
}

public sealed class StorePickupShipping : IShippingStrategy
{
    public string Code => "STORE";
    public decimal Compute(decimal subtotal) => subtotal >= 499m ? 0m : 60m;
}

public sealed class CheckoutFeeSummary
{
    public decimal TotalShipping(IShippingStrategy strategy, decimal subtotal)
        => strategy.Compute(subtotal);
}`,
          expectedBehavior: [
            '明天新增「低溫宅配 (ColdChainShipping)」只需新增一個類別並註冊，CheckoutFeeSummary 零修改。',
          ],
          learningObjectives: ['用多型策略模式替換不斷增長的 switch/if-else'],
          rubricBasis: ['能用具體新需求說明多型如何保護既有流程不被反覆修改'],
        },
        editable: {
          analogy: {
            story: '任天堂 Switch 主機不用每次出新遊戲就請玩家拆主機焊新晶片，只要插進符合卡匣規格的新遊戲片就能玩。',
            mapping: 'CheckoutFeeSummary 是主機，StorePickupShipping 與 ColdChainShipping 是遊戲卡匣。',
            boundary: '若整個系統確定永遠只有固定兩種不變的列舉狀態（如開／關），簡單 if/else 更清楚，不用為兩行程式套多型。',
          },
          plainExplanation: '如果你的某個 `switch` 在過去兩個月內為了加新類型被改了四次，且每次改完都要重測整支函式，那就是多型發揮威力的地方。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch6-s5',
        chapterId: 'ch6',
        order: 5,
        title: '千萬別寫出「假多型」：在多型迴圈裡又用 is / switch 拆型別',
        contentVersion: 1,
        conceptIds: ['ch6.runtime_dispatch', 'ch6.open_closed'],
        corePoint: '拿到 INotifier 卻又寫 `if (n is EmailNotifier e)`，等於親手把多型拆回緊耦合分支。',
        locked: {
          definition: '若呼叫端對抽象型別做向下轉型 (Downcasting) 或型別檢查 (is / switch type pattern) 來決定行為，代表抽象契約設計不足，破壞了多型的去耦合效果。',
          termMappings: [
            { termZh: '向下轉型', termEn: 'Downcasting', meaning: '將抽象或父類別參考強制轉回具體子類別的動作' },
          ],
          codeTitle: 'AvoidTypeChecking.cs',
          codeLanguage: 'csharp',
          code: `// 反例：假多型 — 每次加新管道這段 switch 又要改！
// foreach (var n in notifiers)
// {
//     if (n is EmailNotifier email) email.SendEmail(...);
//     else if (n is SmsNotifier sms) sms.SendSms(...);
// }

// 正解：統一契約方法名稱為 Send，把差異藏進實作內部
foreach (var n in notifiers)
{
    n.Send(recipient, message);
}`,
          expectedBehavior: ['呼叫端完全不知道具體子類別名稱，新增管道不會導致 switch 漏網之魚。'],
          learningObjectives: ['偵測程式碼中的向下轉型壞味道', '將差異行為收斂到共同介面方法'],
          rubricBasis: ['說明為何對抽象介面做 is 判斷會破壞多型與 OCP'],
        },
        editable: {
          analogy: {
            story: '聘請了各國翻譯員並說好統一聽「開始翻譯」，結果每次開會還要自己先認出對方是日文翻譯還是法文翻譯再喊不同暗號。',
            mapping: '既然都用介面包起來了，就該把方法名稱統一成 Send()。',
            boundary: '在序列化、錯誤邊界記錄或明確處理少數封閉型別樹（如 AST 節點）時，C# pattern matching 有其正當用途。',
          },
          plainExplanation: '這也是初學介面最常出現的現象：雖然傳入了 `INotifier`，裡面卻偷偷 `if (notifier is ...)`。把動作推回介面方法就解決了。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch6-s6',
        chapterId: 'ch6',
        order: 6,
        title: '多型的測試紅利：不用改正式程式就能插入 Fake 替身',
        contentVersion: 1,
        conceptIds: ['ch6.runtime_dispatch'],
        corePoint: '多型不只讓未來好擴充，也讓你現在就能用記憶體內假物件驗證業務流程，無需真的發簡訊。',
        locked: {
          definition: '因為呼叫端僅依賴抽象介面，測試程式可傳入記錄呼叫次數與參數的 Fake 實作，在無外部網路與花費的情況下驗證行為正確性。',
          termMappings: [
            { termZh: '測試替身', termEn: 'Test Double / Fake', meaning: '為單元測試目的實作相同介面的可控輕量替代物件' },
          ],
          codeTitle: 'FakeNotifierTestSample.cs',
          codeLanguage: 'csharp',
          code: `public sealed class SpyNotifier : INotifier
{
    public List<(string Recipient, string Message)> SentLog { get; } = new();
    public string ChannelName => "Spy";
    public void Send(string recipient, string message)
        => SentLog.Add((recipient, message));
}`,
          expectedBehavior: ['測試執行完後只需斷言 spy.SentLog.Count == 1 即可確認有正確通知。'],
          learningObjectives: ['連結多型與可測試性，了解下一章依賴注入的動機'],
          rubricBasis: ['說明多型契約如何讓測試替身無縫取代外部真實服務'],
        },
        editable: {
          analogy: {
            story: '測試汽車安全氣囊系統時，用假人與感測器接上同樣的訊號接頭測試觸發時機，而不是每次測試都真的報廢一台真車加真人駕駛。',
            mapping: 'SpyNotifier 就是接在 INotifier 插座上的感測假人。',
            boundary: 'Fake 測試證明你的業務邏輯接線與呼叫條件正確，但真實外部 SDK 的連線設定仍需搭配整合測試驗證。',
          },
          plainExplanation: '看到這裡你已經準備好進入第 7 章：光有多型還不夠，如果在類別裡面直接寫死 `new EmailNotifier()`，測試一樣插不進 SpyNotifier——這就是依賴注入要解決的事。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
    ],
  },
  {
    chapterId: 'ch7',
    order: 7,
    titleZh: '依賴注入',
    titleEn: 'Dependency Injection',
    scenarioTitle: '預約通知服務 (BookingService)',
    summary: '把「建立依賴」與「使用依賴」分開；區分建構子注入手法與 DI 容器工具的不同層次。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch7.separate_creation_usage',
        chapterId: 'ch7',
        titleZh: '分離「建立依賴」與「使用依賴」',
        titleEn: 'Separating Object Creation from Usage',
        importanceWeight: 1.2,
        summary: '類別內部若直接 new 外部服務會綁死實作；應將建立責任交給組裝根 (Composition Root)。',
      },
      {
        conceptId: 'ch7.constructor_injection',
        chapterId: 'ch7',
        titleZh: '建構子注入與依賴反轉 (DIP)',
        titleEn: 'Constructor Injection & DIP',
        importanceWeight: 1.2,
        summary: '透過建構子參數明確宣告「我需要什麼介面才能工作」，是最清楚且不可變的注入方式。',
      },
      {
        conceptId: 'ch7.di_vs_container',
        chapterId: 'ch7',
        titleZh: 'DI 手法與 DI 容器工具的差異',
        titleEn: 'DI Pattern vs. DI Container',
        importanceWeight: 1,
        summary: '依賴注入是一種設計手法，不用框架也能手動做 (Pure DI)；DI 容器只是自動幫你組裝與管理生命週期的工具。',
      },
    ],
    slides: [
      {
        slideId: 'ch7-s1',
        chapterId: 'ch7',
        order: 1,
        title: '在類別裡直接 new 服務會發生什麼事？',
        contentVersion: 1,
        conceptIds: ['ch7.separate_creation_usage'],
        corePoint: '即使宣告型別是介面，只要函式內部寫了 `= new EmailNotifier()`，依然構成硬編碼依賴。',
        locked: {
          definition: '當高階業務類別直接用 new 建立低階外部服務（資料庫、SMTP、時鐘）時，兩者便無法替換實作，也難以獨立單元測試。',
          termMappings: [
            { termZh: '控制反轉', termEn: 'Inversion of Control (IoC)', meaning: '將決定建立哪個具體物件的控制權由類別內部交還給外部組裝端' },
          ],
          codeTitle: 'HardcodedDependency.cs',
          codeLanguage: 'csharp',
          code: `public sealed class TightBookingService
{
    // 控制權抓在自己手裡，外部根本無法換成測試替身或 LineNotifier
    private readonly INotifier _notifier = new EmailNotifier();

    public void ConfirmBooking(string user, string slot)
    {
        // 業務規則...
        _notifier.Send(user, $"已預約：{slot}");
    }
}`,
          expectedBehavior: [
            '就算 _notifier 欄位寫成 INotifier，執行時還是永遠綁死 EmailNotifier。',
            '從類別外部建構子簽章看不出它偷偷依賴了寄信功能。',
          ],
          learningObjectives: ['辨識隱藏在介面欄位背後的 new 硬綁定'],
          rubricBasis: ['即使欄位型別是介面，在內部 new 具體類別仍導致緊耦合'],
        },
        editable: {
          analogy: {
            story: '買了一台投影機，結果它電源線直接焊死在牆壁裡的某個特定配電盒，搬到別間教室完全不能插電。',
            mapping: '在類別裡面寫 `new EmailNotifier()` 就是把插頭焊死在牆上。',
            boundary: '像 `List<T>`、`StringBuilder` 或值物件 `Reservation` 這類純記憶體資料結構，在類別裡直接 new 完全合理，不需要注入。',
          },
          plainExplanation: '要區分什麼東西適合注入：會碰觸外部世界（網路、時間、資料庫）、有替代策略或需要替換測試的服務才要注入；普通局部資料物件不用。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch7-s2',
        chapterId: 'ch7',
        order: 2,
        title: '建構子注入 (Constructor Injection)：誠實宣告需求',
        contentVersion: 1,
        conceptIds: ['ch7.constructor_injection', 'ch7.separate_creation_usage'],
        corePoint: '透過建構子參數接收抽象介面，並存入 private readonly 欄位，讓依賴一目瞭然且不可遺漏。',
        locked: {
          definition: '建構子注入 (Constructor Injection) 是透過類別建構子傳入必要依賴的方式，可搭配 null 防護確保物件建立後隨時處於完整可用狀態。',
          termMappings: [
            { termZh: '建構子注入', termEn: 'Constructor Injection', meaning: '透過建構子參數傳入所需依賴介面並保存為 readonly 欄位' },
            { termZh: '依賴反轉原則', termEn: 'Dependency Inversion Principle (DIP)', meaning: '高階與低階模組皆應依賴抽象介面，而非高階直接依賴低階實作' },
          ],
          codeTitle: 'BookingServiceDi.cs',
          codeLanguage: 'csharp',
          code: `public interface IBookingRepository { void Save(string user, string slot); }

public sealed class BookingService
{
    private readonly IBookingRepository _repo;
    private readonly INotifier _notifier;

    public BookingService(IBookingRepository repo, INotifier notifier)
    {
        _repo = repo ?? throw new ArgumentNullException(nameof(repo));
        _notifier = notifier ?? throw new ArgumentNullException(nameof(notifier));
    }

    public void ConfirmBooking(string user, string slot)
    {
        _repo.Save(user, slot);
        _notifier.Send(user, $"已確認時段：{slot}");
    }
}`,
          expectedBehavior: [
            'BookingService 完全不知背後是 SQL Server、檔案還是記憶體 Fake。',
            '建構子直接揭露此服務需要 Repository 與 Notifier 兩個合作夥伴。',
          ],
          learningObjectives: ['撰寫標準 C# 建構子注入類別', '理解依賴方向從「依賴實作」反轉為「雙方依賴介面」'],
          rubricBasis: ['能指出建構子注入可強制滿足必要依賴並保持欄位不可變'],
        },
        editable: {
          analogy: {
            story: '廚師進廚房前開出採買清單：「給我一組爐具介面跟冰箱介面就能做菜」；至於今天用瓦斯爐還是電磁爐，由餐廳經理從外面配置好推進來。',
            mapping: 'BookingService 是專心做菜的廚師，建構子參數就是那張必須先備齊的設備清單。',
            boundary: '如果一個建構子突然出現 7、8 個注入參數，往往不是 DI 的錯，而是這個類別承擔了太多責任（低內聚）該拆分了。',
          },
          plainExplanation: '建構子注入是 .NET 實務最推薦的預設注入手法：只要能成功 new 出來，物件就保證齊全，不會中途冒出「忘記設定某服務」的 NullReferenceException。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '比較組裝根：正式環境 vs 單元測試環境',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '切換組裝環境推演依賴關係',
          steps: [
            {
              stepLabel: '環境 A：正式環境 (Production)',
              actor: 'new BookingService(new SqlBookingRepository(conn), new EmailNotifier(smtp))',
              stateSnapshot: { _repo: 'SqlBookingRepository', _notifier: 'EmailNotifier', BookingService程式: '0 行修改' },
              explanation: '組裝根傳入真實資料庫與寄信服務。',
              highlightLine: 8,
            },
            {
              stepLabel: '環境 B：測試環境 (Unit Test)',
              actor: 'new BookingService(new InMemoryBookingRepo(), new SpyNotifier())',
              stateSnapshot: { _repo: 'InMemoryBookingRepo', _notifier: 'SpyNotifier', BookingService程式: '0 行修改' },
              explanation: '相同一顆 BookingService，不用連真資料庫也不會寄真信就能跑完驗證。',
              highlightLine: 8,
            },
          ],
        },
      },
      {
        slideId: 'ch7-s3',
        chapterId: 'ch7',
        order: 3,
        title: '不要混淆：依賴注入 (DI) 不等於 DI 容器',
        contentVersion: 1,
        conceptIds: ['ch7.di_vs_container'],
        corePoint: 'Pure DI（手動傳參數組裝）就已經是完整的依賴注入；IServiceCollection 只是自動化組裝工具。',
        locked: {
          definition: '依賴注入 (DI) 是一種「從外部傳入依賴」的軟體設計原則；DI 容器 (DI Container) 則是自動解析依賴圖並管理物件生命週期的框架工具，兩者並不畫上等號。',
          termMappings: [
            { termZh: '純粹依賴注入', termEn: 'Pure DI', meaning: '不使用任何框架容器，直接在組裝根手動 new 並傳入建構子' },
            { termZh: 'DI 容器', termEn: 'DI Container / IoC Container', meaning: '如 Microsoft.Extensions.DependencyInjection，自動註冊與解析物件圖的工具' },
          ],
          codeTitle: 'PureDiVsContainer.cs',
          codeLanguage: 'csharp',
          code: `// 1. Pure DI（小專案或主程式入口直接手動組裝，完全沒有任何框架也是 DI！）
var service = new BookingService(
    new InMemoryBookingRepo(),
    new ConsoleNotifier());

// 2. ASP.NET Core / Generic Host DI Container（自動幫你組裝與管理週期）
// builder.Services.AddScoped<IBookingRepository, SqlBookingRepository>();
// builder.Services.AddTransient<INotifier, EmailNotifier>();
// builder.Services.AddScoped<BookingService>();`,
          expectedBehavior: [
            '兩者使用的 BookingService 程式碼一模一樣，完全不綁定任何 DI 框架套件。',
          ],
          learningObjectives: ['區分設計手法 (DI) 與框架工具 (DI Container)', '認識組裝根 (Composition Root) 概念'],
          rubricBasis: ['明確區分「不用容器也可做 DI」與「容器的自動解析功能」'],
        },
        editable: {
          analogy: {
            story: '「用標準插頭設計電器」是 DI 設計原則；「家裡裝一個智慧配電盤自動幫你分配哪台電器接哪路電源」是 DI 容器。沒裝智慧配電盤，你手動插延長線一樣在用標準插頭！',
            mapping: 'Pure DI 就像自己手動插好這幾條線，簡單小程式清清楚楚；上百個服務的大型 Web 系統才交給容器自動接線。',
            boundary: '不論手動還是容器，組裝行為都應該集中在程式最外層的 Composition Root（例如 Program.cs），不可把容器物件本身到處傳來傳去（避免 Service Locator 反模式）。',
          },
          plainExplanation: '很多新手以為「要裝 NuGet 套件才叫 DI」，其實只要你在 `Main` 把依賴傳進建構子，你已經在做標準的依賴注入了！',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch7-s4',
        chapterId: 'ch7',
        order: 4,
        title: '服務生命週期概念：Transient、Scoped、Singleton',
        contentVersion: 1,
        conceptIds: ['ch7.di_vs_container'],
        corePoint: '使用 DI 容器時必須清楚物件活多久：每次要都建新、每筆請求共用一個、還是全系統唯一。',
        locked: {
          definition: '在 .NET DI 容器中常見三種生命週期：Transient（每次解析建立新實例）、Scoped（同一請求或 Scope 內共用）、Singleton（應用程式生命週期內單一實例）。',
          termMappings: [
            { termZh: '短暫週期', termEn: 'Transient', meaning: '每次注入皆建立全新實例，適合無狀態輕量計算服務' },
            { termZh: '範圍週期', termEn: 'Scoped', meaning: '同一次 HTTP 請求內共用同一個實例，適合 DbContext 與交易工作單元' },
            { termZh: '單例週期', termEn: 'Singleton', meaning: '整個應用共享唯一實例，必須注意執行緒安全且不可依賴 Scoped 服務' },
          ],
          codeTitle: 'ServiceLifetimes.cs',
          codeLanguage: 'csharp',
          code: `// 生命週期選擇原則：
// Singleton -> 全系統共用的無狀態設定或執行緒安全快取（不可捕捉 Scoped！）
// Scoped    -> 單一請求的工作單元 / 資料庫連線上下文
// Transient -> 每次使用都需要獨立新鮮狀態的輕量工廠或策略`,
          expectedBehavior: [
            '若將 Scoped 的資料庫 Context 注入 Singleton 服務（Captive Dependency），會造成執行期錯誤或跨使用者資料錯亂。',
          ],
          learningObjectives: ['區分 Transient / Scoped / Singleton 適用情境', '避開長生命週期捕捉短生命週期的錯誤'],
          rubricBasis: ['正確說明三種服務生命週期差異與常見錯誤依賴'],
        },
        editable: {
          analogy: {
            story: '餐廳裡：免洗筷是 Transient（每拿一雙就新的）、這桌客人的點餐夾是 Scoped（這桌結帳前共用同一份）、店門口叫號主機是 Singleton（全店同一台）。',
            mapping: '你不會把「單桌點餐夾」鎖進「全店叫號主機」裡面變成所有人共用同一張帳單。',
            boundary: '若在純 Pure DI 主控台程式中，自己手動 new 就直接決定了誰共用哪一個實例，概念同樣適用。',
          },
          plainExplanation: 'ASP.NET Core 預設在開發環境會幫你檢查「Singleton 不能注入 Scoped」，早點理解這三者，就能看懂 `Program.cs` 裡的 `AddScoped`、`AddTransient` 到底在寫什麼。',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
      {
        slideId: 'ch7-s5',
        chapterId: 'ch7',
        order: 5,
        title: '反模式警告：Service Locator（服務定位器）',
        contentVersion: 1,
        conceptIds: ['ch7.constructor_injection', 'ch7.separate_creation_usage'],
        corePoint: '把 `IServiceProvider` 整個塞進類別裡面自己 `.GetService<T>()`，會讓依賴重新變成黑盒子。',
        locked: {
          definition: 'Service Locator 反模式指類別不直接透過建構子宣告所需依賴，而是持有一個通用容器並於方法內部動態抓取服務，隱藏了真實依賴關係。',
          termMappings: [
            { termZh: '服務定位器', termEn: 'Service Locator', meaning: '由類別主動向全局或傳入的容器索取依賴的反模式' },
          ],
          codeTitle: 'AvoidServiceLocator.cs',
          codeLanguage: 'csharp',
          code: `// 反例：看不出 BookingService 到底需要誰，沒註冊要到執行期才爆開
public class BadBookingService
{
    private readonly IServiceProvider _sp;
    public BadBookingService(IServiceProvider sp) => _sp = sp;

    public void Confirm(string user)
    {
        var notifier = (INotifier)_sp.GetService(typeof(INotifier))!;
        notifier.Send(user, "OK");
    }
}`,
          expectedBehavior: ['呼叫端建構 BadBookingService 時以為只需要一個參數，實際執行 Confirm() 卻可能因缺少 INotifier 而當場擲出例外。'],
          learningObjectives: ['識別 Service Locator 與 Constructor Injection 的本質差異'],
          rubricBasis: ['指出 Service Locator 隱藏依賴且推遲錯誤發生時機'],
        },
        editable: {
          analogy: {
            story: '修車師傅沒說要帶板手跟千斤頂，只說「給我整個百寶箱」，到車禍現場打開才發現裡面忘了放千斤頂。',
            mapping: '建構子明確列出 `IBookingRepository, INotifier` 就像清楚列出必要工具，缺一個就組裝不起來。',
            boundary: '在極少數底層框架中介軟體或工廠內部為了延遲解析插件型別，才會在 Composition Root 邊界有限度使用工廠委派。',
          },
          plainExplanation: '判斷是不是好 DI 很簡單：**看一個類別的建構子，就能立刻畫出它依賴的對象。**',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch7-s6',
        chapterId: 'ch7',
        order: 6,
        title: '時間與隨機數也是外部依賴！',
        contentVersion: 1,
        conceptIds: ['ch7.separate_creation_usage', 'ch7.constructor_injection'],
        corePoint: '在業務邏輯裡直接寫 `DateTime.UtcNow` 會讓時間邊界測試變得極難重現；.NET 提供 `TimeProvider` 注入。',
        locked: {
          definition: '將當前時間視作外部依賴（如 .NET 內建抽象 TimeProvider）並透過建構子注入，能讓時段判斷、過期檢查與排程規則變得完全可重現與可測試。',
          termMappings: [
            { termZh: '時間抽象', termEn: 'TimeProvider', meaning: '.NET 提供的標準時間依賴抽象，可在測試中注入 FakeTimeProvider' },
          ],
          codeTitle: 'TimeProviderDi.cs',
          codeLanguage: 'csharp',
          code: `public sealed class BookingWindowChecker
{
    private readonly TimeProvider _time;
    public BookingWindowChecker(TimeProvider time) => _time = time;

    public bool CanCancelFree(DateTimeOffset reservedAt)
        => reservedAt - _time.GetUtcNow() >= TimeSpan.FromHours(24);
}`,
          expectedBehavior: ['測試時只要傳入固定時間的 TimeProvider，不必等真實時間過一天或改系統時鐘。'],
          learningObjectives: ['意識到全域靜態狀態（時間、亂數、環境變數）也是一種耦合'],
          rubricBasis: ['理解將時間抽象納入建構子注入如何提升可測性'],
        },
        editable: {
          analogy: {
            story: '電影拍跨夜戲不會真的等半夜兩點才拍，而是透過燈光布景控制「攝影棚時間」。',
            mapping: '注入 TimeProvider 讓單元測試一毫秒內就能模擬「訂位前 23 小時 59 分」與「24 小時 01 分」。',
            boundary: '單純用來打 log 時間戳記的地方可直接取系統時間，只有參與商業判斷條件的時間才需要抽出來注入。',
          },
          plainExplanation: '這技巧對時段邏輯、優惠券到期與重試延遲特別好用，學起來能省下無數等 timer 的測試痛苦。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
    ],
  },
  {
    chapterId: 'ch8',
    order: 8,
    titleZh: 'MVC 架構',
    titleEn: 'Model-View-Controller',
    scenarioTitle: '線上訂房與文章表單請求流程 (ASP.NET Core MVC)',
    summary: '釐清 Model、View、Controller 的責任分工與請求生命週期，破除「Model 就是資料庫」與「MVC vs SPA 互斥」迷思。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch8.mvc_roles',
        chapterId: 'ch8',
        titleZh: 'Model / View / Controller 各自責任',
        titleEn: 'MVC Roles & Boundaries',
        importanceWeight: 1.2,
        summary: 'Controller 負責接收、驗證輸入與協調；Model 表達領域規則、資料結構與業務邏輯；View 只負責呈現資料。',
      },
      {
        conceptId: 'ch8.model_not_just_db',
        chapterId: 'ch8',
        titleZh: 'Model 不等於資料庫，Thin Controller 原則',
        titleEn: 'Model ≠ Database & Thin Controller',
        importanceWeight: 1.2,
        summary: 'Model 涵蓋領域物件、業務規則與 ViewModel；不要把所有邏輯塞進 Controller，也不要把 Model 簡化成資料表映射。',
      },
      {
        conceptId: 'ch8.mvc_vs_oop_spa_ssr',
        chapterId: 'ch8',
        titleZh: '區分 OOP、MVC、SSR 與 SPA 層次',
        titleEn: 'Architectural Layer Distinction',
        importanceWeight: 1,
        summary: 'OOP 是程式組織範式，MVC 是分層架構模式，SSR/SPA 是渲染呈現位置與方式；它們處於不同維度，並非互斥對立。',
      },
    ],
    slides: [
      {
        slideId: 'ch8-s1',
        chapterId: 'ch8',
        order: 1,
        title: 'MVC 三大角色與一趟 HTTP 請求生命週期',
        contentVersion: 1,
        conceptIds: ['ch8.mvc_roles'],
        corePoint: '從使用者送出表單開始：Routing -> Controller 協調 -> Model / Service 處理 -> View 呈現回應。',
        locked: {
          definition: 'MVC (Model-View-Controller) 是一種將使用者介面架構拆分為三種責任的模式：Controller 接收請求與協調流程，Model 承載領域邏輯與狀態資料，View 負責格式化輸出呈現。',
          termMappings: [
            { termZh: '控制器', termEn: 'Controller', meaning: '處理 HTTP 請求綁定、輸入驗證狀態檢查與決定回應方式（View 或 Redirect）的協調入口' },
            { termZh: '模型', termEn: 'Model', meaning: '代表應用程式的資料、狀態規則與業務邏輯（包含 Domain Model 與 ViewModel）' },
            { termZh: '檢視', termEn: 'View', meaning: '將傳入的 ViewModel 渲染為 HTML 等呈現結果，不應包含業務規則或資料庫存取' },
          ],
          codeTitle: 'ReservationsController.cs',
          codeLanguage: 'csharp',
          code: `public sealed class ReservationsController : Controller
{
    private readonly IBookingAppService _bookingService;
    public ReservationsController(IBookingAppService bookingService)
        => _bookingService = bookingService;

    [HttpPost]
    public IActionResult Create(CreateReservationInput input)
    {
        if (!ModelState.IsValid)
            return View("Form", input); // 輸入格式錯，回傳表單 View 顯示錯誤

        var result = _bookingService.PlaceReservation(input.GuestName, input.PartySize);
        if (!result.Success)
        {
            ModelState.AddModelError(string.Empty, result.ErrorMessage);
            return View("Form", input);
        }
        return RedirectToAction(nameof(Confirmed), new { id = result.ReservationId });
    }
}`,
          expectedBehavior: [
            'Controller 不自己寫 SQL，也不自己計算複雜桌位規則，只協調驗證、呼叫服務與回傳 ActionResult。',
          ],
          learningObjectives: ['追蹤一筆 POST 請求穿過 Controller、Service/Model、View 的順序'],
          rubricBasis: ['正確描述 Controller 協調、Model 規則資料、View 呈現的三方邊界'],
        },
        editable: {
          analogy: {
            story: '餐廳外場接待員 (Controller) 聽完客人點餐並確認沒漏填品項後，把單子交給廚房主廚依食譜烹調 (Model/Service)，最後由擺盤區裝盤呈現 (View) 上桌。',
            mapping: '接待員既不會自己下鍋炒菜（業務邏輯），也不會叫客人自己進廚房找食材（View 直接查 DB）。',
            boundary: '這個比喻對應伺服器端渲染的 ASP.NET Core MVC；若前後端分離由 API 回傳 JSON，則「JSON 序列化器」取代 HTML View 扮演呈現輸出層。',
          },
          plainExplanation: '把 MVC 想成三張辦公桌：接待桌 (Controller) 只收件與分派，專業規則室 (Model/Service) 做決定，美編排版桌 (View) 只負責把結果畫漂亮。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '追蹤一次訂位表單請求的完整流向',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '依序模擬 HTTP POST /Reservations/Create',
          steps: [
            {
              stepLabel: '1. Routing 與模型繫結',
              actor: 'POST /Reservations/Create (GuestName="小海", PartySize=4)',
              stateSnapshot: { 位置: 'ASP.NET Core Routing', 狀態: '繫結為 CreateReservationInput' },
              explanation: '框架比對路由並將表單欄位轉為強型別 Input Model。',
              highlightLine: 8,
            },
            {
              stepLabel: '2. Controller 檢查並委派',
              actor: 'ReservationsController.Create -> _bookingService.PlaceReservation(...)',
              stateSnapshot: { 位置: 'Controller -> Service/Model', ModelState: 'Valid' },
              explanation: '格式合法後，Controller 把實際商業決策交給注入的服務與領域 Model。',
              highlightLine: 13,
            },
            {
              stepLabel: '3. 決定回應結果 (PRG 模式)',
              actor: 'return RedirectToAction(nameof(Confirmed), ...)',
              stateSnapshot: { 回應: '302 Redirect -> GET /Reservations/Confirmed', 下一步: '由 View 渲染確認頁' },
              explanation: '避免重新整理重複送出表單，導向確認頁由 View 呈現最終資料。',
              highlightLine: 19,
            },
          ],
        },
      },
      {
        slideId: 'ch8-s2',
        chapterId: 'ch8',
        order: 2,
        title: '破除迷思一：「Model 就是資料庫或 Entity 嗎？」',
        contentVersion: 1,
        conceptIds: ['ch8.model_not_just_db'],
        corePoint: '絕對不是！Database 是持久化儲存基礎設施，Model 則是表達問題領域狀態、規則與畫面契約的軟體模型。',
        locked: {
          definition: 'MVC 中的 Model 並非「資料庫本身」或單純的 ORM 資料表映射，而是包含：(1) 具業務規則的 Domain Model、(2) 服務層邏輯、(3) 專為特定畫面或輸入設計的 ViewModel / InputModel。',
          termMappings: [
            { termZh: '領域模型', termEn: 'Domain Model', meaning: '封裝核心業務狀態與規則的類別（如 Wallet、Reservation）' },
            { termZh: '檢視模型', termEn: 'ViewModel', meaning: '專為某個 View 呈現需求組合而成的只讀資料結構' },
            { termZh: '資料庫上下文', termEn: 'Persistence / Repository', meaning: '負責把資料寫入或讀出儲存媒介的基礎設施，不等同於全部的 Model' },
          ],
          codeTitle: 'ModelVarieties.cs',
          codeLanguage: 'csharp',
          code: `// 1. InputModel：接收 HTTP 表單輸入與格式驗證
public sealed record CreateReservationInput(
    [property: Required, StringLength(50)] string GuestName,
    [property: Range(1, 12)] int PartySize);

// 2. ViewModel：只放畫面需要的欄位，避免把內部敏感或資料庫 Entity 直接暴露給 View
public sealed record ReservationSummaryViewModel(
    string ReservationCode,
    string GuestName,
    string StatusLabel);`,
          expectedBehavior: [
            '即使還沒有接 SQL 資料庫，Domain Model 與 ViewModel 依然存在且能獨立運作與測試。',
          ],
          learningObjectives: ['區分 Domain Model、ViewModel 與資料庫儲存實作'],
          rubricBasis: ['明確反駁「Model = Database」的簡化誤解，舉出規則與 ViewModel 角色'],
        },
        editable: {
          analogy: {
            story: '「公司營運模型」包含定價規則、會員等級條件與報表摘要格式；放紙本資料的檔案櫃（資料庫）只是幫你保存它們的工具，檔案櫃本身並不是規則。',
            mapping: '這就是為什麼前面第 1–6 章都在教封裝、內聚與多型——那些設計出來的類別才是真正強壯的 Model 層。',
            boundary: '小型專案為了簡化有時會用 EF Core Entity 兼任 Domain Model，但至少要避免直接把資料庫 Entity 拿來接外部表單（過度綁定風險）。',
          },
          plainExplanation: '以後聽到有人說「M 就是資料庫」，你可以清楚補充：「資料庫只是存放資料的地方；MVC 的 Model 還包含了業務規則、狀態驗證與給畫面用的 ViewModel。」',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch8-s3',
        chapterId: 'ch8',
        order: 3,
        title: '破除迷思二：別把 Controller 寫成幾百行的垃圾桶 (Fat Controller)',
        contentVersion: 1,
        conceptIds: ['ch8.model_not_just_db', 'ch8.mvc_roles'],
        corePoint: 'Controller 應保持纖薄 (Thin Controller)：只管 HTTP 協定轉換、驗證檢查與選擇回應，業務計算交給 Service／Domain。',
        locked: {
          definition: 'Thin Controller 原則將價格計算、狀態轉換與跨資源交易移至 Domain/Application Service，使 Controller 專注於 HTTP 請求解析、權限／輸入邊界與回應組裝。',
          termMappings: [
            { termZh: '肥胖控制器', termEn: 'Fat Controller', meaning: '將大量業務計算、SQL 查詢與外部通知全塞進 Controller 的反模式' },
            { termZh: '纖薄控制器', termEn: 'Thin Controller', meaning: '僅負責接收請求、委派應用服務並回傳 HTTP 結果的精簡控制器' },
          ],
          codeTitle: 'ThinVsFatController.cs',
          codeLanguage: 'csharp',
          code: `// Thin Controller：HTTP 測試或業務單元測試都能輕鬆各自進行
[HttpPost]
public IActionResult Cancel(Guid id)
{
    var outcome = _bookingService.CancelReservation(id, User.Identity?.Name ?? "guest");
    return outcome.Found
        ? RedirectToAction(nameof(Detail), new { id })
        : NotFound();
}`,
          expectedBehavior: [
            '若未來除了網頁端，還要加一個背景排程自動取消過期訂位，排程可直接複用 _bookingService.CancelReservation(...)。',
          ],
          learningObjectives: ['重構 Fat Controller 中不屬於 HTTP 層的業務規則'],
          rubricBasis: ['能列舉把所有業務塞進 Controller 會失去複用性與可測性的理由'],
        },
        editable: {
          analogy: {
            story: '飯店總機負責接電話轉分機、記錄客訴，總不能總機小姐一邊接線一邊親自拿拖把去洗樓梯還順便修電梯。',
            mapping: '只要是「拿掉網頁瀏覽器後，在命令列或排程裡也該成立的規則」，就都不應該寫在 Controller 裡。',
            boundary: '非常單純的靜態頁面或單純讀取轉發，Controller 直接回傳 View(model) 沒問題，不用為了抽象而多包一層空殼 Service。',
          },
          plainExplanation: '檢查 Controller 健康的標準：裡面應該充滿 HTTP 相關詞彙（`ModelState`, `NotFound`, `RedirectToAction`, `View`），而不是算稅金或寫 SQL 字串。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch8-s4',
        chapterId: 'ch8',
        order: 4,
        title: 'View 的責任邊界：只負責安全呈現，不寫業務規則',
        contentVersion: 1,
        conceptIds: ['ch8.mvc_roles'],
        corePoint: 'View（如 Razor `.cshtml`）只負責把傳進來的 ViewModel 轉成介面與編碼輸出，不發資料庫查詢或修改狀態。',
        locked: {
          definition: 'View 層僅負責資料的視覺排版與顯示條件切換（如「若已取消則顯示灰字標籤」），並依賴模板引擎預設 HTML 編碼防範 XSS，不應執行業務計算或持久化修改。',
          termMappings: [
            { termZh: '跨站腳本攻擊防護', termEn: 'XSS Encoding', meaning: 'View 引擎自動對輸出字串做 HTML 跳脫處理，避免執行未信任腳本' },
          ],
          codeTitle: 'RazorViewExample.cshtml.txt',
          codeLanguage: 'csharp',
          code: `@* 概念示範：Razor View 只依強型別 ViewModel 渲染，不做業務運算 *@
@model ReservationSummaryViewModel

<section class="reservation-summary">
  <h1>訂位編號：@Model.ReservationCode</h1>
  <p>訂位人：@Model.GuestName</p>
  <p>目前狀態：@Model.StatusLabel</p>
</section>`,
          expectedBehavior: [
            'View 所需的顯示字串已在 ViewModel 準備就緒，畫面單純易改且不因改 CSS 版面而弄壞商業邏輯。',
          ],
          learningObjectives: ['界定 View 中允許的顯示邏輯 vs 不允許的業務邏輯'],
          rubricBasis: ['View 只應依賴 ViewModel 呈現結果，不負責寫入或複雜運算'],
        },
        editable: {
          analogy: {
            story: '海報排版設計師拿著編輯交過來的定稿數字與文案排版印製，設計師不會自己重新統計公司財報改寫數字。',
            mapping: '在 View 裡寫迴圈渲染列表或判斷「空清單顯示無資料」是合理的顯示邏輯；計算折讓稅率則是 Model 的事。',
            boundary: '前端模板若渲染外部輸入或 AI 回傳內容，也必須一律當成純資料編碼輸出，絕不直接執行未驗證 HTML/JS。',
          },
          plainExplanation: '讓 View 保持單純，你就可以放心地把整個網頁改版重寫，而不用擔心結帳金額會跟著算錯。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch8-s5',
        chapterId: 'ch8',
        order: 5,
        title: '層次釐清：OOP、MVC、SSR 與 SPA 不是互斥的同一層！',
        contentVersion: 1,
        conceptIds: ['ch8.mvc_vs_oop_spa_ssr'],
        corePoint: '別再問「用 SPA 還是 OOP？」「SPA 跟 MVC 是不是二選一？」——它們解決的是完全不同維度的問題。',
        locked: {
          definition: 'OOP（物件導向程式設計）是程式碼模組化與抽象範式；MVC（模型-檢視-控制器）是應用程式結構分層模式；SSR（伺服器端渲染）與 SPA（單頁式應用）則是前端畫面生成與瀏覽器導航的交付模式。四者屬不同正交層次，可自由搭配。',
          termMappings: [
            { termZh: '物件導向程式設計', termEn: 'OOP', meaning: '語言與程式碼層級的設計範式（封裝、繼承、多型）' },
            { termZh: '伺服器端渲染', termEn: 'SSR (Server-Side Rendering)', meaning: '由伺服器將資料套入模板產生完整 HTML 後傳給瀏覽器' },
            { termZh: '單頁式應用', termEn: 'SPA (Single-Page Application)', meaning: '由瀏覽器執行前端 JS 動態更新 DOM，通常透過 API 與後端溝通' },
          ],
          codeTitle: 'OrthogonalLayers.cs',
          codeLanguage: 'csharp',
          code: `// 同一個遵循 OOP 的領域模型與應用服務，可同時支援兩者：
// 1. ASP.NET Core MVC (SSR)：Controller 回傳 View(viewModel) 產出 HTML
// 2. ASP.NET Core Web API + SPA 前端：Controller 回傳 Ok(dto) JSON 給前端渲染

[ApiController]
[Route("api/reservations")]
public sealed class ReservationsApiController : ControllerBase
{
    private readonly IBookingAppService _service;
    public ReservationsApiController(IBookingAppService service) => _service = service;

    [HttpGet("{id:guid}")]
    public IActionResult GetById(Guid id) => Ok(_service.GetSummary(id));
}`,
          expectedBehavior: [
            '同一個後端 C# OOP 領域與服務層，可以同時被 MVC SSR Controller 與供給 SPA 的 API Controller 呼叫。',
          ],
          learningObjectives: ['準確辨別 OOP、MVC、SSR、SPA 各自所屬的抽象層級'],
          rubricBasis: ['不可將 OOP、MVC、SPA、SSR 混為同一分類或宣稱 SPA 與 MVC 必然互斥'],
        },
        editable: {
          analogy: {
            story: '「食材切法與調味技巧 (OOP)」、「中央廚房與點餐分工架構 (MVC)」、「現場熱盤出餐 (SSR) 還是給外帶自助組裝盒 (SPA)」是三個不同問題，可以同時存在。',
            mapping: '例如本學習室網站本身是用 React TypeScript SPA 開發的，但它只負責前端互動展示，而我們學的 C# ASP.NET Core MVC 則是典型後端框架。',
            boundary: '甚至在純前端 SPA 裡也可以採用類似 MVC/MVVM 的分工思想；但不要把 React 前端硬說成是 ASP.NET Core MVC。',
          },
          plainExplanation: '這是最容易被網路口水戰搞混的觀念：**SPA 跟 SSR 是怎麼把畫面送到瀏覽器；MVC 是怎麼整理程式碼責任；OOP 是怎麼設計類別與物件。** 三者各自安好、互不排斥。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch8-s6',
        chapterId: 'ch8',
        order: 6,
        title: '整合視角：OOP 原則如何支撐 MVC 架構？',
        contentVersion: 1,
        conceptIds: ['ch8.mvc_roles', 'ch8.mvc_vs_oop_spa_ssr'],
        corePoint: '前面學的封裝、內聚、組合與 DI，正是讓 MVC 不會爛成一團義大利麵的真正基石。',
        locked: {
          definition: 'MVC 提供了宏觀的請求邊界劃分，而封裝、低耦合、介面契約與建構子注入則確保 Controller 與 Model 層之間可測試、可演進且不彼此污染。',
          termMappings: [
            { termZh: '依賴方向', termEn: 'Dependency Direction', meaning: 'Controller 依賴抽象服務介面，核心領域 Model 不依賴 HTTP 或 UI 框架' },
          ],
          codeTitle: 'CleanDependencyFlow.cs',
          codeLanguage: 'csharp',
          code: `// 依賴方向：
// View (顯示) -> ViewModel <- Controller (HTTP 協調) -> IBookingAppService -> Domain Model (核心規則)
// 注意：Domain Model 層完全不需要 using Microsoft.AspNetCore.Mvc！`,
          expectedBehavior: [
            '核心業務類別與 ASP.NET Core HTTP 型別解耦，未來更換傳輸協定或測試皆極度輕量。',
          ],
          learningObjectives: ['畫出 MVC 內部的合理依賴方向'],
          rubricBasis: ['領域 Model 不應反向依賴 Controller 或 HttpContext'],
        },
        editable: {
          analogy: {
            story: '工廠的總經理（Domain Model）制定產品品質標準，不需要親自研究貨櫃車車牌長什麼樣子（HttpContext）。',
            mapping: 'Controller 負責把 HTTP 請求裡的資料拆包成標準參數或 InputModel，再交給核心領域。',
            boundary: '第 9 章綜合小案例將把這整條流程用一個完整的部落格發表小系統串接追蹤一次。',
          },
          plainExplanation: '到這裡，你已經把單一類別、物件協作、介面多型與 MVC 全串成一張完整地圖了。',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
    ],
  },
  {
    chapterId: 'ch9',
    order: 9,
    titleZh: '綜合小案例',
    titleEn: 'Capstone: Blog MVC Flow',
    scenarioTitle: '部落格文章發表與訂閱通知系統 (C# Classes + Services + MVC)',
    summary: '把前面 8 章觀念全部連起來：從封裝的領域類別、組合式服務、DI 注入到 MVC Controller 的完整可追蹤請求流程。',
    contentVersion: 1,
    concepts: [
      {
        conceptId: 'ch9.end_to_end_flow',
        chapterId: 'ch9',
        titleZh: '領域物件 + 服務層 + MVC 端到端協作',
        titleEn: 'End-to-End Layered Flow',
        importanceWeight: 1.3,
        summary: '能完整追蹤一筆發表文章請求如何穿過 Controller、Application Service、Domain Model、Repository 與 Notifier。',
      },
      {
        conceptId: 'ch9.layer_boundary_tradeoff',
        chapterId: 'ch9',
        titleZh: '跨層設計與變更演進分析',
        titleEn: 'Cross-Layer Design Trade-offs',
        importanceWeight: 1.2,
        summary: '當新增「審核退回」或「Slack 通知」需求時，能精準定位該修改哪一層而不破壞其餘層級。',
      },
    ],
    slides: [
      {
        slideId: 'ch9-s1',
        chapterId: 'ch9',
        order: 1,
        title: '案例藍圖：部落格文章發表流程全貌',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow'],
        corePoint: '一個真實但不臃腫的小案例，讓每一個 OOP 技巧都有清楚的發揮位置。',
        locked: {
          definition: '本案例包含四個協作層級：領域模型 (Article) 保護文章狀態不變量；抽象契約 (IArticleRepository, ISubscriberNotifier) 隔離外部儲存與通知；應用服務 (ArticlePublishService) 以建構子注入協調流程；控制器 (ArticlesController) 處理 HTTP 綁定與回應。',
          termMappings: [
            { termZh: '應用服務', termEn: 'Application Service', meaning: '協調領域物件、儲存庫與外部通知以完成單一使用案例的服務層' },
            { termZh: '儲存庫契約', termEn: 'Repository Interface', meaning: '抽象化領域物件存取與持久化細節的介面' },
          ],
          codeTitle: 'ArchitectureOverview.cs',
          codeLanguage: 'csharp',
          code: `// 元件責任地圖：
// 1. Domain Model : Article (封裝草稿/發布/退回狀態機與標題長度規則)
// 2. Ports/Contracts: IArticleRepository, ISubscriberNotifier (介面隔離外部細節)
// 3. Application Svc: ArticlePublishService (建構子 DI + 組合協調)
// 4. MVC Controller : ArticlesController (Thin Controller -> ViewModel / Redirect)`,
          expectedBehavior: [
            '每一層都有單一清晰的責任與明確的依賴邊界。',
          ],
          learningObjectives: ['建立完整分層心智模型，理解各章概念如何接軌'],
          rubricBasis: ['說出 Domain Model、Service、Repository 介面與 Controller 各自定位'],
        },
        editable: {
          analogy: {
            story: '報社發稿流程：總編輯核對稿件規範 (Article 規則)、發行部對外存檔並發推播 (Repository + Notifier)、流程主編協調步驟 (Service)、收發櫃台收作者投稿 (Controller)。',
            mapping: '四個角色各司其職，任何人休假替班（換資料庫或換推播管道）都不會弄亂稿件規範。',
            boundary: '實務上只有幾支簡單 CRUD 的頁面不必硬套過多層；但一旦有狀態規則與多管道通知，這種結構就非常清晰好維護。',
          },
          plainExplanation: '接下來的 6 張簡報，我們會逐層把這個小系統的完整 C# 程式碼攤開，並追蹤一筆 POST 請求怎麼跑完。',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
      {
        slideId: 'ch9-s2',
        chapterId: 'ch9',
        order: 2,
        title: '領域層：封裝狀態轉換的 Article 類別',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow'],
        corePoint: '「文章內容空白不能發布」、「已發布文章不能重複發布」屬於業務不變量，直接住在 Article 類別裡。',
        locked: {
          definition: 'Article 類別將狀態轉換 (Draft -> Published) 與發布前置規則封裝於 Publish(DateTimeOffset now) 方法內，禁止外部直接竄改 IsPublished 或 PublishedAt。',
          termMappings: [
            { termZh: '狀態轉換方法', termEn: 'State Transition Method', meaning: '檢查條件後統一更新多個關聯欄位的領域行為方法' },
          ],
          codeTitle: 'Article.cs',
          codeLanguage: 'csharp',
          code: `public enum ArticleStatus { Draft, Published }

public sealed class Article
{
    public Guid Id { get; }
    public string Title { get; private set; }
    public string Body { get; private set; }
    public ArticleStatus Status { get; private set; }
    public DateTimeOffset? PublishedAt { get; private set; }

    public Article(Guid id, string title, string body)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("標題不可空白。", nameof(title));
        Id = id;
        Title = title.Trim();
        Body = body ?? string.Empty;
        Status = ArticleStatus.Draft;
    }

    public void Publish(DateTimeOffset utcNow)
    {
        if (Status == ArticleStatus.Published)
            throw new InvalidOperationException("文章已經發布，不可重複發布。");
        if (Body.Trim().Length < 20)
            throw new InvalidOperationException("內文至少需 20 字才可發布。");

        Status = ArticleStatus.Published;
        PublishedAt = utcNow;
    }
}`,
          expectedBehavior: [
            'Status 與 PublishedAt 永遠保持同步一致，不可能出現 Status == Published 但 PublishedAt 為 null 的矛盾狀態。',
          ],
          learningObjectives: ['綜合運用建構子、private set 與業務方法保護雙欄位不變量'],
          rubricBasis: ['狀態與時間戳記應由同一領域方法原子性更新'],
        },
        editable: {
          analogy: {
            story: '正式公文一旦蓋上發文印章（Publish），就同步壓上發文日期，且不能拿同一張紙重蓋第二次。',
            mapping: 'Publish(utcNow) 把「檢查字數 + 改狀態 + 押時間」綁在一起完成。',
            boundary: 'Article 完全不認識資料庫也不認識 HttpContext，單獨一個類別就能做最乾淨的單元測試。',
          },
          plainExplanation: '注意這裡把時間 `utcNow` 當作參數傳給 `Publish`，讓 `Article` 連 `TimeProvider` 都不必直接耦合！',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch9-s3',
        chapterId: 'ch9',
        order: 3,
        title: '契約層：抽象化儲存庫與多型通知管道',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow', 'ch9.layer_boundary_tradeoff'],
        corePoint: '以介面宣告應用程式對外部世界的需求，讓儲存與通知都可替換、可擴充、可測試。',
        locked: {
          definition: '透過定義精簡介面 IArticleRepository 與 ISubscriberNotifier，應用服務只依賴抽象契約，可於執行期組合多個多型通知實作。',
          termMappings: [
            { termZh: '組合多個多型實作', termEn: 'IEnumerable<INotifier>', meaning: '注入多個相同介面實作並依序多型分派通知' },
          ],
          codeTitle: 'BlogContracts.cs',
          codeLanguage: 'csharp',
          code: `public interface IArticleRepository
{
    Article? FindById(Guid id);
    void Save(Article article);
}

public interface ISubscriberNotifier
{
    void NotifyPublished(Article article);
}

public sealed class EmailSubscriberNotifier : ISubscriberNotifier
{
    public void NotifyPublished(Article article)
        => Console.WriteLine($"[Email] 新文章上線：{article.Title}");
}`,
          expectedBehavior: [
            '未來新增 RssSubscriberNotifier 或 WebhookNotifier 時，無需修改 IArticleRepository 或 Article。',
          ],
          learningObjectives: ['設計精簡且高內聚的 Port 介面'],
          rubricBasis: ['介面隔離儲存與通知兩種不同變更軸線'],
        },
        editable: {
          analogy: {
            story: '新聞編輯台只要接好「新聞歸檔系統」與「外電發布機」兩個標準接頭，底下要用哪家廠商隨營運決定。',
            mapping: 'IEnumerable<ISubscriberNotifier> 更讓你一次可以接上好幾個不同的推播頻道。',
            boundary: '小系統若只需要單一實作且未來不擴充，也可只傳一個 ISubscriberNotifier；C# DI 容器對兩者都原生支援。',
          },
          plainExplanation: '介面方法只寫「呼叫端真正要做的事」：`FindById`、`Save`、`NotifyPublished`，沒有任何多餘的方法污染契約。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch9-s4',
        chapterId: 'ch9',
        order: 4,
        title: '應用服務層：DI 組合與流程協調',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow'],
        corePoint: 'Application Service 是使用案例的指揮官：讀出物件 -> 呼叫領域行為 -> 儲存 -> 觸發通知。',
        locked: {
          definition: 'ArticlePublishService 透過建構子注入取得儲存庫、多型通知集合與時間提供者，將領域規則保留在 Article 內，自身僅協調跨元件步驟與回傳清楚結果。',
          termMappings: [
            { termZh: '結果物件', termEn: 'Result Object', meaning: '明確表達成功／失敗理由的回傳型別，避免以一般流程當例外拋出' },
          ],
          codeTitle: 'ArticlePublishService.cs',
          codeLanguage: 'csharp',
          code: `public sealed record PublishOutcome(bool Success, string Message, Guid? ArticleId = null);

public sealed class ArticlePublishService
{
    private readonly IArticleRepository _repo;
    private readonly IEnumerable<ISubscriberNotifier> _notifiers;
    private readonly TimeProvider _time;

    public ArticlePublishService(
        IArticleRepository repo,
        IEnumerable<ISubscriberNotifier> notifiers,
        TimeProvider time)
    {
        _repo = repo;
        _notifiers = notifiers;
        _time = time;
    }

    public PublishOutcome PublishArticle(Guid articleId)
    {
        var article = _repo.FindById(articleId);
        if (article is null) return new PublishOutcome(false, "找不到指定文章。");

        try
        {
            article.Publish(_time.GetUtcNow());
        }
        catch (InvalidOperationException ex)
        {
            return new PublishOutcome(false, ex.Message);
        }

        _repo.Save(article);
        foreach (var notifier in _notifiers) notifier.NotifyPublished(article);
        return new PublishOutcome(true, "文章已成功發布。", article.Id);
    }
}`,
          expectedBehavior: [
            '若字數不足導致 article.Publish 拒絕轉換，_repo.Save 與 _notifiers 皆不會被執行！',
            '整個流程可於無資料庫、無網頁伺服器的單元測試中 100% 驗證。',
          ],
          learningObjectives: ['區分 Application Service（流程協調）與 Domain Model（業務不變量）的責任'],
          rubricBasis: ['業務驗證失敗時不得執行後續儲存與通知副作用'],
        },
        editable: {
          analogy: {
            story: '舞台監督（Service）確認主角（Article）準備就緒完成變身動作後，才通知燈光師存檔並放煙火（Save + Notify）。',
            mapping: '只要 Article.Publish() 說不行，後面存檔跟發推播全部不會誤發。',
            boundary: '實務若通知發送可能因網路失敗，通常會在 Save 之後改為記錄待發送事件 (Outbox) 而非阻斷主流程，這也是進階可靠度設計的核心概念。',
          },
          plainExplanation: '注意看這段程式碼的美感：它把第 1 章的類別、第 2 章的封裝、第 5 章的介面、第 6 章的多型迴圈、第 7 章的 DI 全部乾淨地串在一起了！',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch9-s5',
        chapterId: 'ch9',
        order: 5,
        title: 'MVC 表現層：Thin Controller 與 ViewModel',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow'],
        corePoint: 'Controller 只接請求、轉交 Service、組出給畫面看的安全 ViewModel 或導頁，不塞業務邏輯。',
        locked: {
          definition: 'ArticlesController 接收 HTTP 請求後委派 ArticlePublishService，依結果回傳重導向或轉換後的 ViewModel 給 View 顯示。',
          termMappings: [
            { termZh: 'TempData / Redirect', termEn: 'PRG Pattern', meaning: 'Post-Redirect-Get 防止重新整理重複送出表單的 MVC 慣例' },
          ],
          codeTitle: 'ArticlesController.cs',
          codeLanguage: 'csharp',
          code: `public sealed record ArticleDetailViewModel(
    Guid Id,
    string Title,
    string StatusText,
    string? PublishedAtText);

public sealed class ArticlesController : Controller
{
    private readonly ArticlePublishService _publishService;
    private readonly IArticleRepository _repo;

    public ArticlesController(ArticlePublishService publishService, IArticleRepository repo)
    {
        _publishService = publishService;
        _repo = repo;
    }

    [HttpPost]
    public IActionResult Publish(Guid id)
    {
        var outcome = _publishService.PublishArticle(id);
        TempData["Notice"] = outcome.Message;
        return RedirectToAction(nameof(Details), new { id });
    }

    [HttpGet]
    public IActionResult Details(Guid id)
    {
        var article = _repo.FindById(id);
        if (article is null) return NotFound();

        var vm = new ArticleDetailViewModel(
            article.Id,
            article.Title,
            article.Status == ArticleStatus.Published ? "已發布" : "草稿",
            article.PublishedAt?.ToString("yyyy-MM-dd HH:mm"));
        return View(vm);
    }
}`,
          expectedBehavior: [
            'View 只拿到純粹顯示用的 ArticleDetailViewModel，無法在畫面裡意外呼叫 article.Publish(...)。',
          ],
          learningObjectives: ['完成從 HTTP POST 到 GET Details ViewModel 的可追蹤流程'],
          rubricBasis: ['Controller 維持精簡協調，View 不直接接收或操作具副作用的領域實體'],
        },
        editable: {
          analogy: {
            story: '門市窗口收件 (Publish POST) 後發給客人一張取件導向單 (Redirect)，客人走去展示櫃台 (Details GET) 看到的是排版好的電子看板 (ViewModel)，而不是後台機密操作終端。',
            mapping: '把領域物件轉成 ViewModel，同時保護了領域封裝也防止過度暴露欄位。',
            boundary: '若在單純 Web API 供 React SPA 使用，Details 就改回傳 `Ok(vm)` 的 JSON 即可，Service 與 Domain 完全不用改。',
          },
          plainExplanation: '整個請求路線清楚到你可以用手指從頭畫到尾，每個檔案都很短、很好讀、而且都有清楚的原因放在那裡。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
        simulation: {
          title: '端到端追蹤：POST /Articles/Publish/{id}',
          modeLabel: '步驟模擬／結果推演',
          initialActionLabel: '逐步追蹤整條 MVC + OOP 請求鏈',
          steps: [
            {
              stepLabel: '1. ArticlesController.Publish',
              actor: 'POST /Articles/Publish/a1b2',
              stateSnapshot: { 層級: 'Controller', 動作: '呼叫 _publishService.PublishArticle(id)' },
              explanation: 'Controller 不自己檢查文章字數，交給應用服務。',
              highlightLine: 20,
            },
            {
              stepLabel: '2. ArticlePublishService -> Repo',
              actor: 'var article = _repo.FindById(id);',
              stateSnapshot: { 層級: 'Application Service', 狀態: '取得 Draft 文章（內文 45 字）' },
              explanation: '透過介面從儲存庫載入領域物件。',
            },
            {
              stepLabel: '3. Article.Publish (領域不變量)',
              actor: 'article.Publish(_time.GetUtcNow());',
              stateSnapshot: { 層級: 'Domain Model', Status: 'Published', PublishedAt: '已押上 UTC 時間' },
              explanation: '文章自身驗證字數 >= 20 且未重複發布，原子性更新狀態。',
            },
            {
              stepLabel: '4. Save + 多型 Notifiers',
              actor: '_repo.Save(article) -> foreach notifier.NotifyPublished(article)',
              stateSnapshot: { 層級: 'Infra / Adapters', 已儲存: 'true', 已通知管道: 'Email, Webhook' },
              explanation: '確認狀態合法後才寫入與多型通知。',
            },
            {
              stepLabel: '5. Redirect -> GET Details -> View',
              actor: 'RedirectToAction(Details) -> View(ArticleDetailViewModel)',
              stateSnapshot: { 層級: 'MVC View', 回傳: 'HTML（顯示已發布與格式化時間）' },
              explanation: '建立純顯示用的 ViewModel 交給 View 渲染完成本次請求。',
              highlightLine: 30,
            },
          ],
        },
      },
      {
        slideId: 'ch9-s6',
        chapterId: 'ch9',
        order: 6,
        title: 'Program.cs 組裝根：把全部介面與類別接上線',
        contentVersion: 1,
        conceptIds: ['ch9.end_to_end_flow', 'ch9.layer_boundary_tradeoff'],
        corePoint: '所有具體實作的選擇都集中在最外層的組裝根，內部各層保持零耦合。',
        locked: {
          definition: '應用程式啟動點 (Program.cs) 擔任組裝根 (Composition Root)，負責註冊所有介面對應的具體實作與生命週期，並啟動 MVC 路由。',
          termMappings: [
            { termZh: '組裝根', termEn: 'Composition Root', meaning: '應用程式唯一集中決定並組裝具體實作相依關係的入口點' },
          ],
          codeTitle: 'ProgramCompositionRoot.cs',
          codeLanguage: 'csharp',
          code: `// ASP.NET Core Program.cs 概念組裝
// builder.Services.AddControllersWithViews();
// builder.Services.AddSingleton(TimeProvider.System);
// builder.Services.AddScoped<IArticleRepository, EfArticleRepository>();
// builder.Services.AddScoped<ISubscriberNotifier, EmailSubscriberNotifier>();
// builder.Services.AddScoped<ISubscriberNotifier, WebhookSubscriberNotifier>();
// builder.Services.AddScoped<ArticlePublishService>();`,
          expectedBehavior: [
            '同一個介面 ISubscriberNotifier 註冊兩次時，DI 容器會自動將兩者組合成 IEnumerable<ISubscriberNotifier> 注入 ArticlePublishService。',
          ],
          learningObjectives: ['看懂真實 ASP.NET Core 專案的 Program.cs 服務註冊結構'],
          rubricBasis: ['明確辨識組裝行為應集中在應用程式最外層'],
        },
        editable: {
          analogy: {
            story: '開演前劇場總控室把麥克風、投影機、音響全部插上正確頻道；演出開始後演員只管按劇本演，不自己跑去機房換插頭。',
            mapping: 'Program.cs 就是那間只在開演前接線的總控室。',
            boundary: '若用 Pure DI（不啟動 Web 容器）寫 Console 測試工具，只需自己手動 `new ArticlePublishService(...)` 就能跑一模一樣的服務。',
          },
          plainExplanation: '以後打開別人的 C# MVC 專案，先看 `Program.cs` 註冊了哪些介面，再看 `Controllers/` 入口，最後追進 `Services/` 與 `Models/`，幾分鐘就能掌握整個專案架構。',
          detailLevel: 'standard',
          layoutVariant: 'split_code',
        },
      },
      {
        slideId: 'ch9-s7',
        chapterId: 'ch9',
        order: 7,
        title: '變更演進檢核：當系統出現三個新需求時',
        contentVersion: 1,
        conceptIds: ['ch9.layer_boundary_tradeoff'],
        corePoint: '好架構不是「永遠不會改」，而是「每個新需求都有清楚、局部、可預期的修改位置」。',
        locked: {
          definition: '檢驗分層與 OOP 設計是否成功，在於當業務規則、通知管道、或呈現介面各自變化時，修改是否能被限制在對應單一層級內完成。',
          termMappings: [
            { termZh: '變更正交性', termEn: 'Orthogonality of Change', meaning: '不同類型的需求異動只影響各自對應的模組而互不干擾' },
          ],
          codeTitle: 'ChangeImpactChecklist.cs',
          codeLanguage: 'csharp',
          code: `// 變更需求定位對照：
// 1. 「文章標題不能超過 60 字，內文改為至少 50 字」 -> 只改 Domain: Article
// 2. 「發布後同時發送到 Discord Webhook」           -> 只新增 DiscordNotifier 並於 Program.cs 註冊
// 3. 「發布成功頁改成同時支援手機 JSON API」       -> 新增 ApiController，共用同一個 ArticlePublishService`,
          expectedBehavior: [
            '三種完全不同軸線的新需求，彼此不會互相破壞或強迫全面重寫。',
          ],
          learningObjectives: ['面對綜合架構變更題能精準指出受影響元件與不動元件'],
          rubricBasis: ['能追蹤具體變更對 Domain、Service、Adapter、Controller/View 的影響'],
        },
        editable: {
          analogy: {
            story: '換輪胎去輪胎行、改引擎調校進技師廠、換車內音響換車機主機——因為介面標準化，各改各的不牽連整台車報廢。',
            mapping: '這就是你花時間學完這 9 章 C# OOP 與 MVC 之後，在每個專案都能帶走的設計直覺。',
            boundary: '別忘了定期做題庫練習與錯題複習，把這些判斷轉化為反射直覺！',
          },
          plainExplanation: '恭喜讀完 9 章核心簡報！建議立刻前往第 9 章綜合題組測試自己對完整請求流與變更定位的掌握度。',
          detailLevel: 'standard',
          layoutVariant: 'focused_concept',
        },
      },
    ],
  },
];
