export {};

declare global {
  interface MwApi {
    get(
      params: Record<string, string | undefined>,
    ): Promise<Record<string, any>>;
    post(
      params: Record<string, string | undefined>,
    ): Promise<Record<string, any>>;
    postWithEditToken?(
      params: Record<string, string | undefined>,
    ): Promise<Record<string, any>>;
    postWithToken?(
      type: string,
      params: Record<string, string | undefined>,
    ): Promise<Record<string, any>>;
  }

  interface MediaWiki {
    config: { get(key: string): unknown };
    util: {
      addPortletLink(
        portletId: string,
        href: string,
        text: string,
        id?: string,
        tooltip?: string,
      ): HTMLLIElement | null;
    };
    Api: new () => MwApi;
  }

  const mw: MediaWiki;

  interface Window {
    mw: MediaWiki;
  }
}
