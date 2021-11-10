export function nameOf<T extends Record<string, any>>(options: {
  subkeys?: (keyof T)[];
  parent?: string;
  onGet?: (name: string) => string;
}): T {
  return new Proxy(
    {},
    {
      get: (target, name) => {
        name = name.toString();
        let result = options.subkeys?.includes(name as any)
          ? nameOf({ ...options, parent: name, subkeys: [] })
          : `${options.parent ? `${options.parent}.${name}` : name}`;
        if (typeof result === "string" && options.onGet)
          result = options.onGet(result);
        return result;
      },
    }
  ) as any;
}
