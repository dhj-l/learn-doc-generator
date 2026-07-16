# 第6章 元数据反射与自定义装饰器

> 预计学习时间：40 分钟

## 🎯 本章目标

学习完本章，你将能够：

- 理解 TypeScript 元数据反射（reflect-metadata）的原理
- 掌握 `Reflector` 类的用法：`get` / `getAllAndOverride` / `getAllAndMerge`
- 掌握 `SetMetadata` 和自定义装饰器的创建
- 掌握 `createParamDecorator` 自定义参数装饰器的创建
- 理解 `ExecutionContext` 的设计
- 在面试中解释元数据反射在 NestJS 中的应用

## 📋 前置知识

> 你已经在使用 NestJS 的 `@Get`、`@Post` 等装饰器，本章将深入装饰器的底层实现机制。
>
> 建议先完成 [第5章 请求生命周期](./05-request-lifecycle.md) 的学习，特别是 Guard 和 Interceptor 中使用 Reflector 的部分。

## 💡 核心概念

### 概念一：reflect-metadata 是什么？

#### 类比引入

想象你收到一个快递包裹：

- **包裹本身**：一个类或函数
- **快递单**：元数据（metadata）—— 写着"易碎品"、"此面朝上"等标签
- **贴标签的人**：TypeScript 编译器或装饰器
- **读标签的人**：NestJS 的 IoC 容器

反射（Reflection）就是**在运行时读取这些标签的能力**。

#### 概念讲解

**reflect-metadata** 是一个 ES 提案的 Polyfill，它允许你：

1. **设置元数据**：给对象/类/属性/参数附加额外信息
2. **读取元数据**：在运行时获取这些信息

```typescript
import 'reflect-metadata';

class UsersService {
  findAll() {}
  findOne(id: number) {}
}

// 设置元数据
Reflect.defineMetadata('roles', ['admin'], UsersService);
Reflect.defineMetadata('description', '用户服务', UsersService.prototype.findAll);

// 读取元数据
Reflect.getMetadata('roles', UsersService); // ['admin']
Reflect.getMetadata('description', UsersService.prototype.findAll); // '用户服务'
```

#### TypeScript 自动生成的元数据

开启 `emitDecoratorMetadata: true` 后，TypeScript 编译器会自动生成三类元数据：

```typescript
// 你在 TypeScript 中写的代码
@Injectable()
export class UsersService {
  constructor(
    private database: DatabaseService,
    private logger: LoggerService,
  ) {}
}

// TypeScript 编译后自动生成的元数据 ≈
// Node.js v22 环境下 reflect-metadata 的行为
Reflect.defineMetadata(
  'design:paramtypes',
  [DatabaseService, LoggerService],
  UsersService,
);

Reflect.defineMetadata(
  'design:returntype',  // 如果方法有返回类型注解
  Promise,
  UsersService.prototype.findAll,
);

Reflect.defineMetadata(
  'design:type',
  Function,
  UsersService.prototype,
  'findAll',
);
```

这就是 NestJS "自动注入"的**秘密**：依赖 `design:paramtypes` 获取构造函数参数的类型信息。

---

### 概念二：SetMetadata —— 给路由打标签

#### SetMetadata 的本质

```typescript
// 你使用的语法
@SetMetadata('roles', ['admin'])
@Get()
findAll() {}
```

**本质**：在目标对象上写入元数据：

```typescript
// SetMetadata 内部实现 ≈
function SetMetadata(key: string, value: any) {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // 方法级别装饰器：写入方法的元数据
      Reflect.defineMetadata(key, value, target, propertyKey);
    } else {
      // 类级别装饰器：写入类的元数据
      Reflect.defineMetadata(key, value, target);
    }
  };
}
```

#### 自定义装饰器

不直接使用 `SetMetadata`，而是封装成语义化的装饰器：

```typescript
// 方式1：使用 SetMetadata 封装（推荐）
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// 使用
@Roles('admin', 'superadmin')
@Get('users')
findAll() {}

// 方式2：使用 Reflector.createDecorator（类型安全）
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();

// 使用
@Roles(['admin', 'superadmin'])
@Get('users')
findAll() {}
```

---

### 概念三：Reflector —— 读取元数据的工具

#### Reflector 的使用

Reflector 是 NestJS 提供的**读取元数据的工具类**：

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    // 1. get: 从单个目标读取元数据
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    // 或者从 Controller 级别读取
    // const roles = this.reflector.get<string[]>('roles', context.getClass());
    
    // 2. getAllAndOverride: 合并并覆盖
    // 方法级别覆盖 Controller 级别
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),   // 方法级别（优先）
      context.getClass(),     // 类级别（回退）
    ]);
    
    // 3. getAllAndMerge: 合并所有级别的元数据
    const roles = this.reflector.getAllAndMerge<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    // 如果方法定义了 ['admin']，类定义了 ['user']
    // 合并结果: ['admin', 'user']
    
    if (!roles || roles.length === 0) return true;
    
    const { user } = context.switchToHttp().getRequest();
    return roles.some(role => user.roles?.includes(role));
  }
}
```

#### getAllAndOverride 的优先级规则

```typescript
@Roles(['user'])  // Controller 级别
@Controller('users')
export class UsersController {
  
  @Roles(['admin'])  // 方法级别（覆盖 Controller）
  @Get()
  findAll() {}
  
  @Get('profile')  // 没有 @Roles 装饰器
  getProfile() {}  // 使用 Controller 级别的 ['user']
}
```

`getAllAndOverride` 的处理逻辑：

```
查找顺序：方法级别 → Controller 级别
如果在方法级别找到了，直接返回（不继续找 Controller 级别）
如果在方法级别没找到，回退到 Controller 级别
如果都没找到，返回 undefined
```

---

### 概念四：ExecutionContext —— 执行上下文

#### ExecutionContext 的结构

```typescript
// ExecutionContext 是 NestJS 中贯穿 Guard、Interceptor、Pipe、Filter 的统一抽象
interface ExecutionContext {
  // 当前执行的 Controller 类
  getClass<T = any>(): Type<T>;
  
  // 当前执行的路由处理器方法
  getHandler<T = any>(): T;
  
  // 切换到 HTTP 上下文（REST API）
  switchToHttp(): HttpArgumentsHost;
  
  // 切换到 WebSocket 上下文
  switchToWs(): WsArgumentsHost;
  
  // 切换到 RPC 上下文（微服务）
  switchToRpc(): RpcArgumentsHost;
  
  // 获取当前请求类型
  getType<TContext extends string = ContextType>(): TContext;
}
```

#### 多协议支持

```typescript
@Injectable()
export class MultiProtocolGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const type = context.getType();
    
    switch (type) {
      case 'http':
        // HTTP 请求（REST API）
        const request = context.switchToHttp().getRequest();
        return this.validateHttp(request);
        
      case 'ws':
        // WebSocket 连接
        const client = context.switchToWs().getClient();
        return this.validateWs(client);
        
      case 'rpc':
        // 微服务消息
        const data = context.switchToRpc().getData();
        return this.validateRpc(data);
        
      default:
        return false;
    }
  }
}
```

---

### 概念五：createParamDecorator —— 自定义参数装饰器

#### 自定义参数装饰器的两种方式

```typescript
// 方式1：简单的数据提取
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    // data 是装饰器传入的参数
    // @User('name') → data = 'name'
    // @User() → data = undefined
    return data ? user?.[data] : user;
  },
);

// 使用
@Get('profile')
getProfile(@User('name') name: string) {
  // 只提取 user.name
}

@Get('profile/full')
getFullProfile(@User() user: UserEntity) {
  // 获取整个 user 对象
}
```

```typescript
// 方式2：结合 Pipe 做数据转换
export const ParseUser = createParamDecorator(
  (data: keyof UserEntity, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// 使用 Pipe 对参数做二次处理
@Get()
findOne(@ParseUser(new ValidationPipe()) user: UserEntity) {
  // 先获取 user，再用 ValidationPipe 验证
}
```

---

### 概念六：装饰器组合

你可以组合多个装饰器实现强大的功能：

```typescript
// 1. 路由装饰器 + 元数据装饰器
@Get('users')
@Roles('admin')
@Public()
findAll() {}

// 2. 自定义组合装饰器
import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';

export function Auth(...roles: string[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    // 你也可以在这里添加 Swagger 文档等
    // ApiBearerAuth(),
    // ApiUnauthorizedResponse({ description: '未授权' }),
  );
}

// 使用
@Get('users')
@Auth('admin')  // 一个装饰器 = 多个装饰器的组合
findAll() {}
```

---

## 🔨 实战演练

### 练习一：实现一个缓存装饰器

<details>
<summary>🧑‍💻 先自己实现，再展开看参考</summary>

```typescript
// cache.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY = 'cache';
export const CACHE_TTL_KEY = 'cache_ttl';

// @Cache(60) → 缓存 60 秒
export const Cache = (ttlSeconds: number = 60) => 
  SetMetadata(CACHE_TTL_KEY, ttlSeconds);

// cache.interceptor.ts
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @Inject('CACHE_MANAGER') private cache: Map<string, any>,
  ) {}
  
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, context.getHandler());
    
    if (!ttl) {
      // 没有设置 @Cache() 装饰器，不缓存
      return next.handle();
    }
    
    const request = context.switchToHttp().getRequest();
    const cacheKey = `${request.method}-${request.url}`;
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return of(cached);
    }
    
    // 没有缓存，执行 handler 然后缓存结果
    return next.handle().pipe(
      tap(data => {
        this.cache.set(cacheKey, data);
        // 设置 TTL（简化示例）
        setTimeout(() => this.cache.delete(cacheKey), ttl * 1000);
      }),
    );
  }
}
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1: reflect-metadata 在 NestJS 中扮演什么角色？**
> A: 它是 NestJS DI 系统的基石。TypeScript 通过 `emitDecoratorMetadata` 生成 `design:paramtypes` 元数据，NestJS 利用这些元数据实现自动依赖注入。同时它也用于存储模块配置、路由信息等。

**Q2: Reflector.getAllAndOverride 的查找逻辑？**
> A: 按照传入的顺序查找元数据。通常先传 `context.getHandler()`（方法级别），再传 `context.getClass()`（类级别）。方法级别有定义则直接返回，否则回退到类级别。

**Q3: SetMetadata 和 Reflector.createDecorator 的区别？**
> A: SetMetadata 是底层 API，直接设置元数据；Reflector.createDecorator 是类型安全的封装，提供了更好的类型推断。

**Q4: ExecutionContext 解决了什么问题？**
> A: 它抽象了不同协议（HTTP/WebSocket/RPC）的执行上下文，让 Guard、Interceptor、Pipe、Filter 可以在多种传输层中复用。

**Q5: applyDecorators 的作用？**
> A: 将多个装饰器组合成一个，方便复用。相当于 `@A @B @C` 可以写成 `@Compose(A, B, C)`。

</details>

---

## 📝 本章小结

- ✅ reflect-metadata 是 NestJS DI 的基础，通过 `design:paramtypes` 实现自动注入
- ✅ SetMetadata 用于在类和路由方法上附加元数据
- ✅ Reflector 是读取元数据的工具，支持 get/getAllAndOverride/getAllAndMerge
- ✅ ExecutionContext 抽象了多协议执行上下文
- ✅ createParamDecorator 用于创建自定义参数装饰器
- ✅ applyDecorators 用于组合多个装饰器

## ➡️ 下一章预告

> 在下一章中，我们将进入**面试专题**——专门为 AI 全栈岗位整理的 30+ 道 NestJS 面试高频问题，包含原理解析、追问策略和源码级解答，帮你从容应对面试。
>
> [下一章：面试高频问题与深度解析](./07-interview-questions.md)
