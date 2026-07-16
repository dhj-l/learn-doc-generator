# 附录 B：常见错误排错指南

> 收集了 NestJS 开发中最高频的 15+ 个错误，包含错误信息、原因分析和解决方案。

---

## 一、依赖注入错误

### E1: Nest can't resolve dependencies of UsersService

**完整错误：**
```
Nest can't resolve dependencies of the UsersService (?). 
Please make sure that the argument DatabaseService at index [0] is available 
in the UsersModule context.
```

**原因分析：**
- `DatabaseService` 未在 `UsersModule` 的 `providers` 中注册
- 或者 `DatabaseService` 未从它所属的模块中 `exports`
- 或者 `UsersModule` 没有 `imports` 包含 `DatabaseService` 的模块

**解决方案：**
```typescript
// 方案1：如果 DatabaseService 属于 UsersModule
@Module({
  providers: [UsersService, DatabaseService],  // ✅ 添加
})

// 方案2：如果 DatabaseService 在其他模块
@Module({
  imports: [DatabaseModule],  // ✅ import 包含 DatabaseService 的模块
  providers: [UsersService],
})
```

---

### E2: Nest cannot create a circular dependency

**完整错误：**
```
Nest cannot create a circular dependency.
Please make sure that you use forwardRef() in the relationship.
```

**原因分析：**
- 两个 provider 互相注入对方
- 或者两个模块互相 import

**解决方案：**
```typescript
// 使用 forwardRef 打破循环
@Injectable()
export class ServiceA {
  constructor(
    @Inject(forwardRef(() => ServiceB))
    private serviceB: ServiceB,
  ) {}
}

// 模块级别的循环引用同样处理
@Module({
  imports: [forwardRef(() => ModuleB)],
})
export class ModuleA {}
```

---

### E3: The provider with the token is not registered

**完整错误：**
```
Nest could not find InjectionToken element (CONFIG) 
in the UsersModule context
```

**原因分析：**
- 使用了字符串 Token 的 provider（如 `@Inject('CONFIG')`）未注册
- 或者注册了但未从模块中 exports

**解决方案：**
```typescript
// 检查 provider 是否已注册
@Module({
  providers: [
    { provide: 'CONFIG', useValue: { port: 3000 } },  // ✅
  ],
  exports: ['CONFIG'],  // 如果其他模块也要用
})
```

---

## 二、模块配置错误

### E4: Dynamic module must return a module reference

**完整错误：**
```
Invalid dynamic module: DynamicModule must contain a 'module' property.
```

**原因分析：**
- 动态模块的静态方法返回的对象缺少 `module` 属性

**解决方案：**
```typescript
static forRoot(): DynamicModule {
  return {
    module: YourModule,  // ✅ 必须包含 module 引用
    providers: [],
    exports: [],
  };
}
```

---

### E5: Module imports itself

**完整错误：**
```
A module cannot import itself.
```

**原因分析：**
- 在模块的 `imports` 中传入了模块自身

**解决方案：**
```typescript
@Module({
  imports: [
    // ❌ 不要这样: UsersModule 自己 import 自己
    // UsersModule
  ],
})
export class UsersModule {}
```

---

## 三、路由/请求错误

### E6: Cannot find route /api/users

**完整错误：**
```
Cannot GET /api/users
```
> ⚠️ **注意**：实际 NestJS 返回的是 404 HTML 错误页面，开发阶段建议在浏览器 Network 面板查看状态码或在 Controller 中添加日志定位。

**原因分析：**
- Controller 的路由前缀有误
- 模块未在根模块中 import
- 路由方法装饰器使用了错误的 HTTP 方法

**解决方案：**
```typescript
// 检查 Controller 的路由前缀
@Controller('users')  // → /users
export class UsersController {
  @Get() findAll() {}  // → GET /users
}

// 检查模块是否已注册
@Module({
  imports: [UsersModule],  // ✅ 根模块中 import
})
```
**调试技巧**：启动时观察控制台，NestJS 会打印所有已注册的路由：
```
[Nest] LOG [RoutesResolver] UsersController {/users}:
[Nest] LOG [NestApplication] GET /users
[Nest] LOG [NestApplication] POST /users
```

---

### E7: Pipe transform 后类型错误

**完整错误：**
```
The first argument must be of type string...
```

**原因分析：**
- Pipe 的 `transform` 方法返回了错误类型
- 或者 Pipe 未正确处理输入值

**解决方案：**
```typescript
// 确保 Pipe 返回正确的类型
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException('ID must be a number');
    }
    return parsed;  // ✅ 返回 number
  }
}
```

---

## 四、生命周期错误

### E8: Shutdown hooks 不生效

**完整错误：**
```
（无错误，但 onModuleDestroy / onApplicationShutdown 没被调用）
```

**原因分析：**
- 没有调用 `app.enableShutdownHooks()`

**解决方案：**
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // ✅ 必须调用
  await app.listen(3000);
}
```

---

## 五、测试错误

### E9: Test module 中 provider 未找到

**完整错误：**
```
Nest can't resolve dependencies of the UsersController.
```

**原因分析：**
- 在测试模块中没有正确 mock 依赖

**解决方案：**
```typescript
const module = await Test.createTestingModule({
  controllers: [UsersController],
  providers: [
    {
      provide: UsersService,
      useValue: { findAll: jest.fn() },  // ✅ Mock 所有使用的方法
    },
  ],
}).compile();
```

---

## 六、中间件/Guard 错误

### E10: Guard 放行了所有请求

**问题描述：**
明明写了 Guard，但所有请求都没有被拦截。

**原因分析：**
- `canActivate` 方法返回了 `undefined`（而不是 `true/false`）
- Guard 未正确绑定

**解决方案：**
```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // ✅ 确保返回 boolean
    const request = context.switchToHttp().getRequest();
    return !!request.user;  // 返回 true 或 false
  }
}
```

---

## 七、环境配置错误

### E11: ConfigModule 配置未生效

**完整错误：**
```
ConfigService 中的配置值为 undefined
```

**原因分析：**
- `.env` 文件路径不对
- ConfigModule 未使用 `forRoot` 配置
- 配置键大小写不匹配

**解决方案：**
```typescript
// 确保 forRoot 正确配置
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',  // ✅ 确保文件存在
    }),
  ],
})

// 使用正确的键（注意大小写）
const port = this.configService.get<number>('PORT');  // ✅ 与 .env 一致
```

---

## 八、常见逻辑错误

### E12: Interceptor 中修改了响应但不生效

**问题描述：**
Interceptor 的 `map` 操作符没有修改响应数据。

**原因分析：**
- 使用了 `@Res()` 装饰器手动发送响应
- 当使用 `@Res()` 时，NestJS 不会自动处理响应，Interceptor 的 `map` 就失效了

**解决方案：**
```typescript
// ❌ 使用 @Res() 时 Interceptor 不生效
@Get()
findAll(@Res() res: Response) {
  return res.json([]);
}

// ✅ 让 NestJS 自动处理响应
@Get()
findAll() {
  return [];  // Interceptor 的 map 会生效
}

// ✅ 如果必须用 @Res()，使用 passthrough: true
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  return [];  // Interceptor 仍然生效
}
```

---

### E13: Provider 是单例但误以为每次请求都会创建

**问题描述：**
在 Service 中存储了请求相关的数据，但发现多个请求之间数据混淆。

**原因分析：**
- 默认是 Singleton 作用域，实例被所有请求共享
- Service 中不应该存储请求级别的状态

**解决方案：**
```typescript
// ❌ 错误：Singleton 中存储请求状态
@Injectable()
export class RequestService {
  private userId: string;  // 多请求间会互相覆盖
}

// ✅ 方案1：使用 REQUEST 作用域
@Injectable({ scope: Scope.REQUEST })
export class RequestService {
  private userId: string;  // 每个请求独立
}

// ✅ 方案2：使用函数参数传递
@Injectable()
export class RequestService {
  getData(userId: string) {
    // 不存储状态，通过参数传递
  }
}
```

---

### E14: DTO 验证不生效

**问题描述：**
`ValidationPipe` 已绑定，但 DTO 中的验证装饰器不生效。

**原因分析：**
- `class-validator` 和 `class-transformer` 未安装
- DTO 属性缺少验证装饰器
- `ValidationPipe` 未正确绑定

**解决方案：**
```bash
# 安装必要的依赖
npm install class-validator class-transformer
```

```typescript
// DTO 添加验证装饰器
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;
  
  @IsEmail()
  email: string;
  
  @IsOptional()
  @Min(18)
  age?: number;
}

// 确保全局绑定
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // 自动去除未装饰的属性
  forbidNonWhitelisted: true,  // 拒绝未装饰的属性
  transform: true,        // 自动类型转换
}));
```

---

### E15: 跨域（CORS）问题

**问题描述：**
前端请求报 CORS 跨域错误。

**原因分析：**
- NestJS 未启用 CORS
- 或者 CORS 配置不正确

**解决方案：**
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 方式1：启用全部
  app.enableCors();
  
  // 方式2：自定义配置
  app.enableCors({
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });
  
  await app.listen(3000);
}
```

---

## 排错检查清单

当你遇到 NestJS 错误时，按以下顺序排查：

```
1. ❓ 是 DI 错误？
   → 检查 providers 数组
   → 检查 exports 数组
   → 检查 imports 数组
   └─ 使用 NEST_DEBUG=true 启动获取详细日志

2. ❓ 是路由错误？
   → 检查 @Controller 路径前缀
   → 检查 @Get/@Post 等方法装饰器
   → 检查模块是否被 import
   └─ 观察控制台启动日志中的路由表

3. ❓ 是 Pipe 错误？
   → 检查 DTO 验证装饰器
   → 检查 class-validator 是否安装
   → 检查 ValidationPipe 配置
   └─ 检查 transform 返回类型

4. ❓ 是测试错误？
   → 检查 Mock 是否覆盖了所有使用的方法
   → 检查 TestingModule 的配置
   └─ 使用 compile() 后检查错误
```
