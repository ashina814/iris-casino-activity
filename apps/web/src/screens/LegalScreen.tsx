type LegalDocument = "privacy" | "terms";

const documents: Record<LegalDocument, { title: string; updated: string; sections: Array<{ heading: string; body: string[] }> }> = {
  terms: {
    title: "IRIS Casino Activity 利用規約",
    updated: "最終更新日: 2026年7月15日",
    sections: [
      { heading: "1. 適用", body: ["本規約は、Discord上で提供するIRIS Casino Activity（以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約に同意したものとします。"] },
      { heading: "2. RISとゲーム", body: ["本サービスではIRIS Economy Botと連携したRISを使用します。RISはDiscordコミュニティ内の仮想通貨であり、現金、暗号資産その他の金銭的価値へ交換するものではありません。", "各ゲームのベット、勝敗、報酬および進行状況は、サーバー側の記録を正とします。通信障害、不正操作、運用上の必要がある場合、運営は取引または報酬を調整できます。"] },
      { heading: "3. 禁止事項", body: ["不正なクライアント改変、APIの不正利用、自動操作、脆弱性の悪用、他者の利用妨害、Discordの利用規約またはコミュニティガイドラインに反する行為を禁止します。"] },
      { heading: "4. 提供条件", body: ["本サービスは現状有姿で提供されます。運営は、保守、セキュリティ、機能改善その他の理由により、内容の変更、中断または終了を行うことがあります。"] }
    ]
  },
  privacy: {
    title: "IRIS Casino Activity プライバシーポリシー",
    updated: "最終更新日: 2026年7月15日",
    sections: [
      { heading: "1. 取得する情報", body: ["本サービスはDiscord認証に伴い、DiscordユーザーID、ユーザー名、表示名、アバターURLを取得します。また、RIS残高、ベット・精算の取引識別子、ゲーム進行、ミッションおよび報酬の記録を取り扱います。"] },
      { heading: "2. 利用目的", body: ["取得した情報は、本人確認、RIS残高の表示と精算、ゲーム進行の保存、不正利用の防止、障害対応および本サービスの運営にのみ使用します。"] },
      { heading: "3. 第三者提供と保管", body: ["RISの予約・精算はIRIS Economy Botの内部APIを通じて行います。ゲーム進行と報酬の状態はサービス運用に必要な範囲でサーバーに保管します。法令上の必要がある場合を除き、広告目的で個人情報を販売または第三者へ提供しません。"] },
      { heading: "4. 削除・お問い合わせ", body: ["利用データに関するお問い合わせや削除の依頼は、本サービスを導入しているDiscordサーバーの運営者へ連絡してください。Discordアカウント自体の情報管理にはDiscordのプライバシーポリシーが適用されます。"] }
    ]
  }
};

export function LegalScreen({ document }: { document: LegalDocument }) {
  const legal = documents[document];
  const other = document === "terms" ? "privacy" : "terms";

  return (
    <main className="legal-page">
      <article className="legal-content">
        <a className="legal-brand" href="/">IRIS CASINO ACTIVITY</a>
        <h1>{legal.title}</h1>
        <p className="legal-updated">{legal.updated}</p>
        {legal.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
        <nav className="legal-links" aria-label="法的文書">
          <a href={other === "terms" ? "/terms" : "/privacy"}>{other === "terms" ? "利用規約" : "プライバシーポリシー"}</a>
          <a href="/">Activityへ戻る</a>
        </nav>
      </article>
    </main>
  );
}
