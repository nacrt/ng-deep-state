import { computed, isSignal, Signal, untracked, WritableSignal, linkedSignal } from "@angular/core";

// based on https://github.com/ngrx/platform/blob/main/modules/signals/src/deep-signal.ts

type NonRecord =
    | Iterable<any>
    | WeakSet<any>
    | WeakMap<any, any>
    | Promise<any>
    | Date
    | Error
    | RegExp
    | ArrayBuffer
    | DataView
    | Function;

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type IsArray<T> = T extends Array<any> ? true : false;

export type IsRecord<T> = T extends object
    ? T extends NonRecord
    ? false
    : true
    : false;

export type IsNestable<T> = IsRecord<T> extends true ? true : IsArray<T> extends true ? true : false;

const DEEP_SIGNAL = Symbol("DEEP_SIGNAL");

export type DeepSignal<T> = Signal<T> &
    Prettify<(IsNestable<T> extends true
        ? Readonly<{
            [K in keyof T]: IsNestable<T[K]> extends true
            ? DeepSignal<T[K]> : Signal<T[K]>;
        } & { [K in NonNullable<keyof T>]: {} }
        >
        : unknown)>;

export type DeepWritableSignal<T> = WritableSignal<T> &
    Prettify<(IsNestable<T> extends true
        ? Readonly<{
            [K in keyof T]: IsNestable<T[K]> extends true
            ? DeepWritableSignal<T[K]> : WritableSignal<T[K]>;
        } & { [K in NonNullable<keyof T>]: {} }
        >
        : unknown)>;

function equal(left: any, right: any) {
    if (typeof left === "object" || typeof right === "object") {
        if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
            for (let index = 0; index < left.length; index++) {
                if (!equal(left[index], right[index])) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }

    return left === right;
}

/**
 * create a nested writable signal
 */
export function toDeepWritableSignal<T>(model: WritableSignal<T>): DeepWritableSignal<T> {
    return new Proxy(model, {
        has(target: any, prop) {
            return Boolean(this.get!(target as any, prop, undefined));
        },

        get(target: any, prop) {
            if (!isRecord(untracked(target))) {
                return target[prop];
            }

            if (typeof target[prop] !== "function") {
                const link = linkedSignal(() => target()?.[prop], { equal });

                const oldset = link.set;
                const oldupdate = link.update;

                link.set = val => {
                    let _target = untracked<any>(target);
                    if (_target === undefined) {
                        target.set(_target = { [prop]: undefined });
                    }

                    oldset(_target[prop] = val);
                    target.set(untracked(target));
                };

                link.update = updateFn => {
                    let _target = untracked<any>(target);
                    if (_target === undefined) {
                        target.set(_target = { [prop]: undefined });
                    }

                    oldupdate(val => _target[prop] = updateFn(val));
                    target.set(untracked(target));
                };

                Reflect.defineProperty(target, prop, {
                    value: link,
                    configurable: true
                });

                target[prop][DEEP_SIGNAL] = true;
            }

            return toDeepWritableSignal<T>(target[prop]);
        }
    });
}

const nonRecords = [
    WeakSet,
    WeakMap,
    Promise,
    Date,
    Error,
    RegExp,
    ArrayBuffer,
    DataView,
    Function
];

function isRecord(value: unknown): value is Record<string, unknown> {
    if (value === undefined) {
        return true;
    }

    if (value === null || typeof value !== "object") {
        return false;
    }

    let proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
        return true;
    }

    while (proto && proto !== Object.prototype) {
        if (nonRecords.includes(proto.constructor)) {
            return false;
        }
        proto = Object.getPrototypeOf(proto);
    }

    return proto === Object.prototype;
}
