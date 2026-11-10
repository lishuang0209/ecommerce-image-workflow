/* ─── 品牌配置（可通过 NEXT_PUBLIC_APP_* 环境变量覆盖，构建时内联） ─── */
export interface BrandConfig {
    name: string;
    tagline: string;
    storagePrefix: string;
}

export const brand: BrandConfig = {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'ShortFilm Agent',
    tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || 'AI 短片创作 Agent',
    storagePrefix: 'sfa',
};
