# 附录 A：NestJS 核心 API 速查表

> 按使用频率排序，每个 API 附带一行最简示例

---

## 一、装饰器

| API | 用途 | 一行示例 |
|-----|------|----------|
| `@Module()` | 定义模块 | `@Module({ imports: [], controllers: [], providers: [], exports: [] })` |
| `@Injectable()` | 标记为容器管理的 provider | `@Injectable() export class UsersService {}` |
| `@Controller()` | 定义控制器 | `@Controller('users') export class UsersController {}` |
| `@Get()` | HTTP GET 路由 | `@Get(':id') findOne(@Param('id') id: string) {}` |
| `@Post()` | HTTP POST 路由 | `@Post() create(@Body() dto: CreateDto) {}` |
| `@Put()` | HTTP PUT 路由 | `@Put(':id') update(@Param('id') id: string, @Body() dto: UpdateDto) {}` |
| `@Delete()` | HTTP DELETE 路由 | `@Delete(':id') remove(@Param('id') id: string) {}` |
| `@Patch()` | HTTP PATCH 路由 | `@Patch(':id') patch(@Param('id') id: string, @Body() dto: PatchDto) {}` |
| `@Param()` | 获取路由参数 | `@Param('id') id: string` |
| `@Query()` | 获取查询参数 | `@Query('page') page: number` |
| `@Body()` | 获取请求体 | `@Body() dto: CreateUserDto` |
| `@Headers()` | 获取请求头 | `@Headers('authorization') auth: string` |
| `@Req()` / `@Request()` | 获取原生请求对象 | `@Req() req: Request` |
| `@Res()` / `@Response()` | 获取原生响应对象 | `@Res() res: Response` |
| `@Inject()` | 显式指定注入 Token | `@Inject('CONFIG') private config: any` |
| `@Optional()` | 标记为可选依赖 | `@Optional() @Inject('REDIS') private redis?: RedisClient` |
| `@Global()` | 标记为全局模块 | `@Global() @Module({...})` |
| `@SetMetadata()` | 设置自定义元数据 | `@SetMetadata('roles', ['admin'])` |
| `@UseGuards()` | 绑定守卫 | `@UseGuards(AuthGuard)` |
| `@UseInterceptors()` | 绑定拦截器 | `@UseInterceptors(LoggingInterceptor)` |
| `@UsePipes()` | 绑定管道 | `@UsePipes(ValidationPipe)` |
| `@UseFilters()` | 绑定异常过滤器 | `@UseFilters(HttpExceptionFilter)` |
| `@HttpCode()` | 自定义 HTTP 状态码 | `@HttpCode(201)` |
| `@Header()` | 自定义响应头 | `@Header('Cache-Control', 'no-store')` |
| `@Redirect()` | 重定向 | `@Redirect('/new-url', 301)` |
| `@SerializeOptions()` | 序列化选项 | `@SerializeOptions({ excludePrefixes: ['_'] })` |

---

## 二、HTTP 状态码异常

| API | 状态码 | 一行示例 |
|-----|--------|----------|
| `BadRequestException` | 400 | `throw new BadRequestException('参数错误')` |
| `UnauthorizedException` | 401 | `throw new UnauthorizedException('未登录')` |
| `ForbiddenException` | 403 | `throw new ForbiddenException('无权限')` |
| `NotFoundException` | 404 | `throw new NotFoundException('资源不存在')` |
| `ConflictException` | 409 | `throw new ConflictException('数据冲突')` |
| `RequestTimeoutException` | 408 | `throw new RequestTimeoutException('请求超时')` |
| `UnsupportedMediaTypeException` | 415 | `throw new UnsupportedMediaTypeException()` |
| `InternalServerErrorException` | 500 | `throw new InternalServerErrorException()` |
| `ServiceUnavailableException` | 503 | `throw new ServiceUnavailableException('服务不可用')'` |

---

## 三、核心工具类

| API | 用途 | 一行示例 |
|-----|------|----------|
| `NestFactory.create()` | 创建 NestJS 应用 | `const app = await NestFactory.create(AppModule)` |
| `NestFactory.createApplicationContext()` | 创建独立应用上下文 | `const app = await NestFactory.createApplicationContext(AppModule)` |
| `Reflector` | 读取元数据 | `this.reflector.get('roles', context.getHandler())` |
| `ModuleRef` | 动态获取 provider | `this.moduleRef.get(ConfigService)` |
| `ExecutionContext` | 执行上下文（Guard/Interceptor/Filter） | `context.switchToHttp().getRequest()` |
| `ArgumentsHost` | 参数宿主（Filter 中获取 request/response） | `host.switchToHttp().getResponse()` |
| `CallHandler` | 拦截器中的处理器 | `next.handle().pipe(map(data => ({ data })))` |
| `PipeTransform` | 管道转换接口 | `transform(value: any, metadata: ArgumentMetadata)` |
| `CanActivate` | 守卫接口 | `canActivate(context: ExecutionContext): boolean` |
| `NestInterceptor` | 拦截器接口 | `intercept(context: ExecutionContext, next: CallHandler): Observable<any>` |
| `ExceptionFilter` | 异常过滤器接口 | `catch(exception: T, host: ArgumentsHost)` |
| `NestMiddleware` | 中间件接口 | `use(req: Request, res: Response, next: NextFunction)` |

---

## 四、作用域常量

| API | 值 | 用途 |
|-----|-----|------|
| `Scope.DEFAULT` | 0 | 单例（默认） |
| `Scope.REQUEST` | 1 | 每个请求一个实例 |
| `Scope.TRANSIENT` | 2 | 每次注入一个新实例 |

---

## 五、生命周期接口

| 接口 | 方法 | 触发时机 |
|------|------|----------|
| `OnModuleInit` | `onModuleInit()` | 模块依赖解析完成后 |
| `OnApplicationBootstrap` | `onApplicationBootstrap()` | 所有模块初始化完成后 |
| `OnModuleDestroy` | `onModuleDestroy()` | 收到关闭信号后 |
| `BeforeApplicationShutdown` | `beforeApplicationShutdown(signal?)` | 关闭钩子触发后 |
| `OnApplicationShutdown` | `onApplicationShutdown(signal?)` | 应用即将关闭前 |

---

## 六、自定义装饰器辅助

| API | 用途 | 一行示例 |
|-----|------|----------|
| `createParamDecorator` | 创建自定义参数装饰器 | `createParamDecorator((data, ctx) => request.user)` |
| `applyDecorators` | 组合多个装饰器 | `applyDecorators(UseGuards(AuthGuard), SetMetadata('roles', roles))` |
| `Reflector.createDecorator` | 类型安全的元数据装饰器 | `const Roles = Reflector.createDecorator<string[]>()` |

---

## 七、内置管道

| 管道 | 用途 | 一行示例 |
|------|------|----------|
| `ValidationPipe` | DTO 验证 | `app.useGlobalPipes(new ValidationPipe())` |
| `ParseIntPipe` | 转整数 | `@Param('id', ParseIntPipe) id: number` |
| `ParseBoolPipe` | 转布尔 | `@Query('active', ParseBoolPipe) active: boolean` |
| `ParseUUIDPipe` | 验证 UUID | `@Param('id', ParseUUIDPipe) id: string` |
| `DefaultValuePipe` | 默认值 | `@Query('page', new DefaultValuePipe(1)) page: number` |

---

## 八、tsconfig.json 配置

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,      // 必须：启用装饰器
    "emitDecoratorMetadata": true,       // 必须：生成 design:paramtypes
    "target": "ES2021",
    "module": "commonjs",
    "strict": true
  }
}
```
