import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="privacy-screen">
      <article>
        <p className="eyebrow">TRI RELAY // DATA POLICY</p>
        <h1>計測とプライバシー</h1>
        <p>
          TRI RELAYは、ゲーム改善と障害調査のために、Vercel公開版で匿名の利用状況と性能指標を収集する場合があります。
          広告識別子、氏名、メールアドレス、自由入力、ゲームの乱数seedは収集しません。
        </p>
        <h2>収集する項目</h2>
        <ul>
          <li>プレイ開始、ウェーブ突破、オーバードライブ使用、勝敗</li>
          <li>ページ表示とWebパフォーマンス指標</li>
          <li>障害時のエラー種別、発生境界、リリース識別子</li>
        </ul>
        <h2>端末内だけに保存する項目</h2>
        <p>
          言語、ミュート、最高記録、試行回数、進行中ランのチェックポイントはブラウザのローカルストレージに保存されます。
          サーバーへ同期しません。ブラウザのサイトデータを削除すると消去できます。
        </p>
        <h2>外部プラットフォーム</h2>
        <p>
          CrazyGames上では同社SDKがプラットフォーム計測を行う場合があります。適用される条件は配信先のプライバシー情報を確認してください。
        </p>
        <p><Link href="/">ゲームへ戻る</Link></p>
      </article>
    </main>
  );
}
