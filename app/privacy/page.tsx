import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="privacy-screen">
      <article>
        <p className="eyebrow">TRI RELAY // DATA POLICY</p>
        <h1>計測とプライバシー</h1>
        <p>
          TRI RELAYは、初見プレイの理解度、ゲームバランス、性能、障害を検証するために、匿名の利用状況と性能指標を収集する場合があります。
          広告識別子、氏名、メールアドレス、自由入力、ゲームの乱数シードは送信しません。
        </p>
        <h2>収集する項目</h2>
        <ul>
          <li>プレイ開始、チュートリアル完了、最初の撃破、アクティブ時間90秒到達、ウェーブ突破、強化選択、オーバードライブ使用、勝敗</li>
          <li>アクティブ時間、初撃破までの時間、操作回数、送電成功率、過負荷回数、選択した強化系統などの集計値</li>
          <li>ページ表示とWebパフォーマンス指標</li>
          <li>障害時のエラー種別、発生境界、リリース識別子</li>
        </ul>
        <h2>端末内だけに保存する項目</h2>
        <p>
          言語、ミュート、最高記録、試行回数、チュートリアル完了状態、進行中ランのチェックポイントはブラウザのローカルストレージに保存されます。
          サーバーへ同期しません。ブラウザのサイトデータを削除すると消去できます。
        </p>
        <h2>外部プラットフォーム</h2>
        <p>
          CrazyGames上では、同社SDKがプラットフォーム側の計測や設定処理を行う場合があります。
          その処理には配信先で提示されるCrazyGamesの条件が適用されます。
        </p>
        <h2>商用公開前の確認</h2>
        <p>
          このページはコア検証版の説明です。運営者情報、問い合わせ窓口、保持期間、解析事業者への正式なリンクは、法務担当者が確認してから商用公開版へ記載します。
          未確定の情報を推測で掲載しません。
        </p>
        <p><Link href="/">ゲームへ戻る</Link></p>

        <hr />

        <p className="eyebrow">ENGLISH</p>
        <h1>Data and privacy</h1>
        <p>
          TRI RELAY may collect anonymous usage and performance metrics to evaluate first-time comprehension,
          game balance, performance, and failures. We do not send an advertising ID, name, email address,
          free-form text, or the random seed used by a run.
        </p>
        <h2>Data that may be collected</h2>
        <ul>
          <li>Run start, tutorial completion, first kill, 90 active seconds reached, wave clears, upgrade selections, overdrive use, and run outcome</li>
          <li>Aggregates such as active time, time to first kill, rotations, productive pulse rate, overload count, and upgrade build</li>
          <li>Page views and web performance measurements</li>
          <li>Error category, error boundary, and release identifier when a failure occurs</li>
        </ul>
        <h2>Data stored only on this device</h2>
        <p>
          Language, mute preference, records, run count, tutorial completion, and an active-run checkpoint are
          stored in browser local storage. They are not synchronized to a server and can be removed by clearing
          this site&apos;s browser data.
        </p>
        <h2>Third-party platform</h2>
        <p>
          On CrazyGames, its SDK may perform platform-side measurement and settings handling. The terms shown by
          CrazyGames on that distribution platform apply to those activities.
        </p>
        <h2>Before commercial release</h2>
        <p>
          This page describes the core-validation build. The operator identity, contact route, retention period,
          and formal analytics-provider links will be added only after legal review. We will not invent details
          that have not been approved.
        </p>
        <p><Link href="/">Return to the game</Link></p>
      </article>
    </main>
  );
}
